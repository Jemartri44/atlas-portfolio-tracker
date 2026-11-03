import { describe, expect, it } from "vitest";
import { crossEnvironment, outputsSensitive, policiesOf, principalStars } from "./lib/guardians.js";
import { type Context, decide } from "./lib/iam.js";
import type { Plan } from "./lib/plan.js";
import { ACCOUNT, ADMIN, renderEnv, SENDER, SUFFIX } from "./lib/renders.js";
import { boundaryOf, effective, roleStatements } from "./lib/roles.js";

// Z1, the isolation, second half: what the deploy and plan roles can and cannot do,
// asked of the rendered policies (identity AND boundary), never of the text of the
// `.tf` files. It is an analysis of structure, not an IAM evaluator (prompt 017 §12 P3):
// the simulator of IAM is a condition of the first `apply`, in 018.

const ENVS = ["dev", "prod"] as const;
type Env = (typeof ENVS)[number];
const plans: Record<string, Plan> = {
  get dev() {
    return renderEnv("dev");
  },
  get prod() {
    return renderEnv("prod");
  },
};

const otherOf = (env: Env): Env => (env === "dev" ? "prod" : "dev");

interface Arns {
  distribution: string;
  cfFunction: string;
  certificate: string;
  webAcl: string;
  lambda: string;
  logGroup: string;
  param: (path: string) => string;
  group: string;
  schedule: string;
  role: (name: string) => string;
  data: string;
  spa: string;
  state: (key: string) => string;
  stateBucket: string;
  artifacts: string;
  artifactsBucket: string;
}

const arns = (env: Env): Arns => ({
  distribution: `arn:aws:cloudfront::${ACCOUNT}:distribution/E1ABCDEF`,
  cfFunction: `arn:aws:cloudfront::${ACCOUNT}:function/atlas-${env}-csp`,
  certificate: `arn:aws:acm:us-east-1:${ACCOUNT}:certificate/1111-2222`,
  webAcl: `arn:aws:wafv2:us-east-1:${ACCOUNT}:global/webacl/atlas-${env}-edge/1111-2222`,
  lambda: `arn:aws:lambda:eu-west-1:${ACCOUNT}:function:atlas-${env}-api`,
  logGroup: `arn:aws:logs:eu-west-1:${ACCOUNT}:log-group:/aws/lambda/atlas-${env}-api`,
  param: (path) => `arn:aws:ssm:eu-west-1:${ACCOUNT}:parameter/atlas/${env}/${path}`,
  group: `arn:aws:scheduler:eu-west-1:${ACCOUNT}:schedule-group/atlas-${env}-jobs`,
  schedule: `arn:aws:scheduler:eu-west-1:${ACCOUNT}:schedule/atlas-${env}-jobs/atlas-${env}-job-ecb`,
  role: (name) => `arn:aws:iam::${ACCOUNT}:role/atlas-${env}-${name}`,
  data: `arn:aws:s3:::atlas-${env}-data-${SUFFIX}`,
  spa: `arn:aws:s3:::atlas-${env}-spa-${SUFFIX}`,
  state: (key) => `arn:aws:s3:::atlas-account-tfstate-${SUFFIX}/${key}`,
  stateBucket: `arn:aws:s3:::atlas-account-tfstate-${SUFFIX}`,
  artifacts: `arn:aws:s3:::atlas-account-artifacts-${SUFFIX}`,
  artifactsBucket: `arn:aws:s3:::atlas-account-artifacts-${SUFFIX}`,
});

/** What `role` of `env` may do, with the boundary of its environment. */
const verdict = (
  env: Env,
  role: "deploy" | "plan",
  action: string,
  resource: string | undefined,
  context: Context = {},
) =>
  effective(
    roleStatements(plans[env] as Plan, `atlas-${env}-${role}`),
    boundaryOf(plans[env] as Plan),
    resource === undefined ? { action, context } : { action, resource, context },
  );

const TAG_CALLS = (a: Arns): [string, string][] => [
  ["cloudfront:TagResource", a.distribution],
  ["cloudfront:UntagResource", a.distribution],
  ["acm:AddTagsToCertificate", a.certificate],
  ["acm:RemoveTagsFromCertificate", a.certificate],
  ["wafv2:TagResource", a.webAcl],
  ["wafv2:UntagResource", a.webAcl],
  ["lambda:TagResource", a.lambda],
  ["lambda:UntagResource", a.lambda],
  ["logs:TagResource", a.logGroup],
  ["logs:UntagResource", a.logGroup],
  ["ssm:AddTagsToResource", a.param("mail/recipient")],
  ["ssm:RemoveTagsFromResource", a.param("mail/recipient")],
  ["scheduler:TagResource", a.group],
  ["scheduler:UntagResource", a.group],
  ["iam:TagRole", a.role("worker")],
  ["iam:UntagRole", a.role("worker")],
  ["s3:PutBucketTagging", a.spa],
];

describe.each(ENVS)(
  "the deploy role of %s and the other environment: the three scenarios of row 5",
  (env) => {
    const own = arns(env);
    const other = otherOf(env);
    const foreign = arns(other);

    it("scenario 1: tags and modifies the distribution of the other environment: denied", () => {
      for (const [action, resource] of TAG_CALLS(foreign)) {
        const context = {
          "aws:ResourceTag/env": other,
          "aws:ResourceTag/project": "atlas",
          "aws:RequestTag/env": env,
          "aws:TagKeys": ["managed_by"],
        };
        expect(verdict(env, "deploy", action, resource, context), `${action} ${resource}`).toBe(
          "deny",
        );
      }
      for (const action of [
        "cloudfront:UpdateDistribution",
        "cloudfront:DeleteDistribution",
        "cloudfront:CreateInvalidation",
      ]) {
        expect(
          verdict(env, "deploy", action, foreign.distribution, { "aws:ResourceTag/env": other }),
          action,
        ).not.toBe("allow");
        expect(
          verdict(env, "deploy", action, own.distribution, {
            "aws:ResourceTag/env": env,
            "aws:ResourceTag/project": "atlas",
          }),
          `${action} on its own`,
        ).toBe("allow");
        // Another project of the account that carries this environment's `env` tag.
        for (const project of ["other", undefined]) {
          const context: Record<string, string> = { "aws:ResourceTag/env": env };
          if (project !== undefined) {
            context["aws:ResourceTag/project"] = project;
          }
          expect(
            verdict(env, "deploy", action, foreign.distribution, context),
            `${action} on a resource of project ${project}`,
          ).not.toBe("allow");
        }
      }
    });

    it("scenario 2: a foreign resource with no tags: the certificate is out of reach, the distribution keeps a written hole", () => {
      // The damage on a foreign resource that carries no tag is denied.
      for (const action of [
        "cloudfront:UpdateDistribution",
        "cloudfront:DeleteDistribution",
        "acm:DeleteCertificate",
        "wafv2:UpdateWebACL",
      ]) {
        const resource = action.startsWith("acm")
          ? own.certificate
          : action.startsWith("wafv2")
            ? own.webAcl
            : own.distribution;
        expect(verdict(env, "deploy", action, resource, {}), action).not.toBe("allow");
      }
      const label = {
        "aws:RequestTag/env": env,
        "aws:RequestTag/project": "atlas",
        "aws:TagKeys": ["env", "project", "managed_by"],
      };
      // Both steps chained. ACM: the bootstrap requests the certificate, so the deploy role has
      // no Allow to label one, nor to delete it afterwards, tagged or not.
      expect(verdict(env, "deploy", "acm:AddTagsToCertificate", own.certificate, label)).not.toBe(
        "allow",
      );
      expect(verdict(env, "deploy", "acm:RequestCertificate", "*", label)).not.toBe("allow");
      for (const action of ["acm:DeleteCertificate", "acm:RemoveTagsFromCertificate"]) {
        expect(
          verdict(env, "deploy", action, own.certificate, {
            "aws:ResourceTag/env": env,
            "aws:ResourceTag/project": "atlas",
          }),
          action,
        ).not.toBe("allow");
      }
      // CloudFront, the residual risk (ADR-0034): creating a distribution with tags needs
      // `cloudfront:TagResource` while `aws:ResourceTag/env` does not exist yet, so the same
      // call on an untagged distribution of another project cannot be told apart from a
      // creation, and a Deny on "no project tag yet" would also deny the creation. Step 1
      // labels it, step 2 (with the tags now there) changes it: both are allowed. It is not
      // between dev and prod; it is the cost of letting the pipeline create the distribution.
      const step1 = verdict(env, "deploy", "cloudfront:TagResource", own.distribution, label);
      const step2 = verdict(env, "deploy", "cloudfront:UpdateDistribution", own.distribution, {
        "aws:ResourceTag/env": env,
        "aws:ResourceTag/project": "atlas",
      });
      expect([step1, step2]).toEqual(["allow", "allow"]);
    });

    it("scenario 3: changes the OAC or a cache, request or headers policy of the other environment: denied", () => {
      const targets = [
        "origin-access-control",
        "cache-policy",
        "origin-request-policy",
        "response-headers-policy",
      ];
      for (const kind of targets) {
        for (const verb of ["Create", "Update", "Delete"]) {
          const noun = {
            "origin-access-control": "OriginAccessControl",
            "cache-policy": "CachePolicy",
            "origin-request-policy": "OriginRequestPolicy",
            "response-headers-policy": "ResponseHeadersPolicy",
          }[kind];
          for (const resource of [`arn:aws:cloudfront::${ACCOUNT}:${kind}/ABC123`, "*"]) {
            expect(
              verdict(env, "deploy", `cloudfront:${verb}${noun}`, resource),
              `${verb}${noun} ${resource}`,
            ).not.toBe("allow");
          }
        }
      }
      for (const statement of roleStatements(plans[env] as Plan, `atlas-${env}-deploy`)) {
        const actions = [statement.Action].flat() as string[];
        for (const action of actions) {
          if (
            /OriginAccessControl|CachePolicy|OriginRequestPolicy|ResponseHeadersPolicy/.test(action)
          ) {
            expect(action.startsWith("cloudfront:Get"), `${statement.Sid}: ${action}`).toBe(true);
          }
        }
      }
    });

    it("(B4a, NB4a) creating with default tags passes; re-tagging what exists elsewhere, or the keys project and env, does not", () => {
      for (const [action, resource] of TAG_CALLS(own)) {
        const untagging = /Untag|Remove/.test(action);
        const creating = {
          "aws:RequestTag/env": env,
          "aws:RequestTag/project": "atlas",
          "aws:TagKeys": ["env", "project", "managed_by"],
        };
        if (!untagging) {
          // The certificate is requested by the bootstrap: the deploy role never labels one.
          expect(verdict(env, "deploy", action, resource, creating), `creating ${action}`).toBe(
            action.startsWith("acm:") ? "implicit-deny" : "allow",
          );
        }
        const changingEnv = { "aws:ResourceTag/env": env, "aws:TagKeys": ["env"] };
        expect(verdict(env, "deploy", action, resource, changingEnv), `env key ${action}`).toBe(
          "deny",
        );
        const changingProject = {
          "aws:ResourceTag/env": env,
          "aws:ResourceTag/project": "atlas",
          "aws:TagKeys": ["project"],
        };
        expect(
          verdict(env, "deploy", action, resource, changingProject),
          `project key ${action}`,
        ).toBe("deny");
        const otherKey = {
          "aws:ResourceTag/env": env,
          "aws:ResourceTag/project": "atlas",
          "aws:TagKeys": ["managed_by"],
        };
        expect(verdict(env, "deploy", action, resource, otherKey), `other key ${action}`).toBe(
          action.startsWith("acm:") ? "implicit-deny" : "allow",
        );
      }
    });

    it("(B4d) touches no role of the bootstrap, of either environment, its own included", () => {
      const actions = [
        "iam:UpdateAssumeRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:DeleteRole",
        "iam:CreateRole",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:UpdateRole",
        "iam:PutRolePermissionsBoundary",
        "iam:DeleteRolePermissionsBoundary",
      ];
      const withBoundary = {
        "iam:PermissionsBoundary": `arn:aws:iam::${ACCOUNT}:policy/atlas-${env}-boundary`,
      };
      for (const action of actions) {
        for (const role of ["admin", "deploy", "plan"]) {
          expect(
            verdict(env, "deploy", action, own.role(role), withBoundary),
            `own ${role} ${action}`,
          ).toBe("deny");
          expect(
            verdict(env, "deploy", action, foreign.role(role), withBoundary),
            `foreign ${role} ${action}`,
          ).not.toBe("allow");
        }
      }
      expect(verdict(env, "deploy", "iam:PutRolePolicy", own.role("api"), withBoundary)).toBe(
        "allow",
      );
    });

    it("never rewrites the trust of the API, the jobs or the scheduler, but may that of another role of the environment", () => {
      const withBoundary = {
        "iam:PermissionsBoundary": `arn:aws:iam::${ACCOUNT}:policy/atlas-${env}-boundary`,
      };
      const names = [
        "api",
        "scheduler",
        "job-ecb",
        "job-prices",
        "job-mail",
        "job-backup",
        "job-integrity",
      ];
      for (const name of names) {
        expect(
          verdict(env, "deploy", "iam:UpdateAssumeRolePolicy", own.role(name), withBoundary),
          name,
        ).toBe("deny");
        expect(
          verdict(env, "deploy", "iam:PutRolePolicy", own.role(name), withBoundary),
          name,
        ).toBe("allow");
      }
    });

    it("(S1) the boundary alone leaves an untagged distribution, certificate or web ACL unchangeable, and still readable", () => {
      const boundary = boundaryOf(plans[env] as Plan);
      const none = { "aws:RequestedRegion": "us-east-1" };
      for (const [action, resource] of [
        ["cloudfront:UpdateDistribution", own.distribution],
        ["cloudfront:DeleteDistribution", own.distribution],
        ["acm:DeleteCertificate", own.certificate],
        ["wafv2:UpdateWebACL", own.webAcl],
        ["wafv2:DeleteWebACL", own.webAcl],
      ] as const) {
        expect(decide(boundary, { action, resource, context: none }), action).not.toBe("allow");
        expect(
          decide(boundary, {
            action,
            resource,
            context: { ...none, "aws:ResourceTag/env": env, "aws:ResourceTag/project": "atlas" },
          }),
          `${action} tagged`,
        ).toBe("allow");
      }
      expect(
        decide(boundary, {
          action: "cloudfront:GetDistribution",
          resource: own.distribution,
          context: none,
        }),
      ).toBe("allow");
    });

    it("creates only roles `atlas-<env>-*` and only with its boundary, and cannot remove it or change it", () => {
      const boundary = `arn:aws:iam::${ACCOUNT}:policy/atlas-${env}-boundary`;
      for (const action of ["iam:CreateRole", "iam:PutRolePolicy", "iam:UpdateAssumeRolePolicy"]) {
        expect(
          verdict(env, "deploy", action, own.role("worker"), {
            "iam:PermissionsBoundary": boundary,
          }),
          action,
        ).toBe("allow");
        expect(
          verdict(env, "deploy", action, own.role("worker"), {}),
          `${action} with none`,
        ).not.toBe("allow");
        expect(
          verdict(env, "deploy", action, own.role("worker"), {
            "iam:PermissionsBoundary": `arn:aws:iam::${ACCOUNT}:policy/atlas-${other}-boundary`,
          }),
          `${action} with the other one`,
        ).not.toBe("allow");
        expect(
          verdict(env, "deploy", action, foreign.role("api"), {
            "iam:PermissionsBoundary": boundary,
          }),
          `${action} on the other environment`,
        ).not.toBe("allow");
        expect(
          verdict(env, "deploy", action, `arn:aws:iam::${ACCOUNT}:role/someone-elses`, {
            "iam:PermissionsBoundary": boundary,
          }),
          `${action} on a role of another project`,
        ).not.toBe("allow");
      }
      for (const action of [
        "iam:PutRolePermissionsBoundary",
        "iam:DeleteRolePermissionsBoundary",
      ]) {
        expect(verdict(env, "deploy", action, own.role("api")), action).toBe("deny");
      }
      for (const action of [
        "iam:CreatePolicy",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicy",
        "iam:DeletePolicyVersion",
        "iam:SetDefaultPolicyVersion",
      ]) {
        expect(
          verdict(env, "deploy", action, `arn:aws:iam::${ACCOUNT}:policy/atlas-${env}-boundary`),
          action,
        ).toBe("deny");
      }
    });

    it("passes a role only to the service that uses it, by exact ARN", () => {
      const lambda = { "iam:PassedToService": "lambda.amazonaws.com" };
      const scheduler = { "iam:PassedToService": "scheduler.amazonaws.com" };
      for (const name of [
        "api",
        "job-ecb",
        "job-prices",
        "job-mail",
        "job-backup",
        "job-integrity",
      ]) {
        expect(verdict(env, "deploy", "iam:PassRole", own.role(name), lambda), name).toBe("allow");
        expect(
          verdict(env, "deploy", "iam:PassRole", own.role(name), scheduler),
          `${name} to Scheduler`,
        ).not.toBe("allow");
      }
      expect(verdict(env, "deploy", "iam:PassRole", own.role("scheduler"), scheduler)).toBe(
        "allow",
      );
      expect(verdict(env, "deploy", "iam:PassRole", own.role("scheduler"), lambda)).not.toBe(
        "allow",
      );
      for (const name of ["admin", "deploy", "plan", "worker"]) {
        expect(verdict(env, "deploy", "iam:PassRole", own.role(name), lambda), name).not.toBe(
          "allow",
        );
      }
      expect(verdict(env, "deploy", "iam:PassRole", foreign.role("api"), lambda)).not.toBe("allow");
      for (const statement of roleStatements(plans[env] as Plan, `atlas-${env}-deploy`)) {
        if ([statement.Action].flat().includes("iam:PassRole")) {
          for (const resource of [statement.Resource].flat() as string[]) {
            expect(resource, statement.Sid).not.toContain("*");
          }
          expect(JSON.stringify(statement.Condition), statement.Sid).toContain(
            "iam:PassedToService",
          );
        }
      }
    });
  },
);

describe.each(ENVS)(
  "the secrets and the objects of %s, out of reach of deploy and plan (row 21, B1)",
  (env) => {
    const a = arns(env);
    const secrets = [
      "auth/google-client-secret",
      "auth/session-key",
      "auth/allow-list",
      "prices/eodhd-key",
      "device-tokens/abc",
      "ibkr/flex-token",
    ];

    it.each(["deploy", "plan"] as const)("%s cannot read or decrypt any secret", (role) => {
      for (const path of secrets) {
        for (const action of ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParameterHistory"]) {
          expect(verdict(env, role, action, a.param(path)), `${action} ${path}`).not.toBe("allow");
        }
        expect(
          verdict(env, role, "ssm:GetParametersByPath", a.param(path.split("/")[0] as string)),
          path,
        ).not.toBe("allow");
      }
      for (const action of ["kms:Decrypt", "kms:GenerateDataKey", "kms:Encrypt"]) {
        expect(
          verdict(env, role, action, `arn:aws:kms:eu-west-1:${ACCOUNT}:key/x`, {
            "kms:ViaService": "ssm.eu-west-1.amazonaws.com",
          }),
          action,
        ).not.toBe("allow");
      }
      for (const statement of roleStatements(plans[env] as Plan, `atlas-${env}-${role}`)) {
        for (const action of [statement.Action].flat() as string[]) {
          expect(action.startsWith("kms:"), `${statement.Sid}: ${action}`).toBe(false);
        }
      }
      expect(verdict(env, role, "ssm:GetParameter", a.param("mail/amounts"))).toBe("allow");
    });

    it.each(["deploy", "plan"] as const)(
      "%s has only bucket actions on the data bucket, never an object",
      (role) => {
        for (const action of [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectVersion",
          "s3:DeleteObjectVersion",
          "s3:AbortMultipartUpload",
          "s3:PutObjectTagging",
        ]) {
          for (const resource of [
            `${a.data}/ledger/ledger.jsonl`,
            `${a.data}/backups/x`,
            `${a.data}/*`,
          ]) {
            expect(verdict(env, role, action, resource), `${action} ${resource}`).not.toBe("allow");
          }
        }
        for (const statement of roleStatements(plans[env] as Plan, `atlas-${env}-${role}`)) {
          const resources = [statement.Resource].flat() as string[];
          if (resources.some((resource) => resource.startsWith(a.data))) {
            for (const action of [statement.Action].flat() as string[]) {
              expect(action, statement.Sid).not.toMatch(
                /^s3:((Get|Put|Delete|Restore|Replicate)Object|AbortMultipartUpload|ListMultipartUploadParts)/,
              );
            }
          }
        }
        expect(verdict(env, role, "s3:ListBucket", a.data)).toBe("allow");
        expect(verdict(env, role, "s3:GetBucketPolicy", a.data)).toBe("allow");
        expect(verdict(env, role, "s3:GetEncryptionConfiguration", a.data)).toBe("allow");
      },
    );

    it("neither the deploy nor the plan role can delete a copy, shorten its lock or bypass it", () => {
      const copy = `${a.data}/backups/2026-10/ledger.jsonl`;
      for (const role of ["deploy", "plan"] as const) {
        for (const action of [
          "s3:DeleteObject",
          "s3:DeleteObjectVersion",
          "s3:BypassGovernanceRetention",
          "s3:PutObjectRetention",
        ]) {
          expect(verdict(env, role, action, copy), `${role} ${action}`).not.toBe("allow");
        }
      }
    });

    it("deploy cannot change the configuration of the data bucket: versioning, lifecycle and policy are the bootstrap's", () => {
      for (const action of [
        "s3:PutBucketPolicy",
        "s3:DeleteBucketPolicy",
        "s3:PutBucketVersioning",
        "s3:PutLifecycleConfiguration",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketPublicAccessBlock",
        "s3:DeleteBucket",
        "s3:PutBucketObjectLockConfiguration",
      ]) {
        expect(verdict(env, "deploy", action, a.data), action).not.toBe("allow");
        expect(verdict(env, "plan", action, a.data), `plan ${action}`).not.toBe("allow");
      }
    });
  },
);

describe.each(ENVS)(
  "the state and the artifacts for %s: two locks, this is the identity one",
  (env) => {
    const a = arns(env);
    const other = otherOf(env);
    const foreign = arns(other);

    it("deploy reads, writes and deletes only the state of its own environment, lock included", () => {
      for (const action of ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]) {
        for (const key of [
          `envs/${env}/terraform.tfstate`,
          `envs/${env}/terraform.tfstate.tflock`,
        ]) {
          expect(verdict(env, "deploy", action, a.state(key)), `${action} ${key}`).toBe("allow");
          expect(
            verdict(env, "deploy", action, foreign.state(key.replace(env, other))),
            `${action} other`,
          ).not.toBe("allow");
        }
        expect(
          verdict(env, "deploy", action, a.state("terraform.tfstate")),
          `${action} at the root`,
        ).not.toBe("allow");
      }
      expect(
        verdict(env, "deploy", "s3:ListBucket", a.stateBucket, { "s3:prefix": `envs/${env}/` }),
      ).toBe("allow");
      expect(
        verdict(env, "deploy", "s3:ListBucket", a.stateBucket, { "s3:prefix": `envs/${other}/` }),
      ).not.toBe("allow");
      expect(verdict(env, "deploy", "s3:ListBucket", a.stateBucket, {})).not.toBe("allow");
    });

    it("plan reads the exact key of its state and nothing else: it cannot write it, delete it or lock it", () => {
      const key = a.state(`envs/${env}/terraform.tfstate`);
      expect(verdict(env, "plan", "s3:GetObject", key)).toBe("allow");
      for (const action of [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:PutObjectTagging",
        "s3:DeleteObjectVersion",
      ]) {
        expect(verdict(env, "plan", action, key), action).not.toBe("allow");
        expect(
          verdict(env, "plan", action, a.state(`envs/${env}/terraform.tfstate.tflock`)),
          `${action} lock`,
        ).not.toBe("allow");
      }
      expect(
        verdict(env, "plan", "s3:GetObject", a.state(`envs/${env}/terraform.tfstate.tflock`)),
      ).not.toBe("allow");
      expect(
        verdict(env, "plan", "s3:GetObject", foreign.state(`envs/${other}/terraform.tfstate`)),
      ).not.toBe("allow");
      expect(
        verdict(env, "plan", "s3:ListBucket", a.stateBucket, { "s3:prefix": `envs/${env}/` }),
      ).toBe("allow");
      expect(
        verdict(env, "plan", "s3:ListBucket", a.stateBucket, { "s3:prefix": `envs/${other}/` }),
      ).not.toBe("allow");
      for (const statement of roleStatements(plans[env] as Plan, `atlas-${env}-plan`)) {
        for (const action of [statement.Action].flat() as string[]) {
          expect(action, statement.Sid).not.toMatch(/^s3:(Put|Delete)/);
        }
      }
    });

    it("only dev writes the artifact; both read it; the plan role touches none", () => {
      const object = `${a.artifacts}/abc1234/jobs.zip`;
      expect(verdict(env, "deploy", "s3:GetObject", object)).toBe("allow");
      expect(verdict(env, "deploy", "s3:ListBucket", a.artifactsBucket)).toBe("allow");
      for (const action of ["s3:PutObject", "s3:DeleteObject"]) {
        expect(verdict(env, "deploy", action, object), action).toBe(
          env === "dev" ? (action === "s3:PutObject" ? "allow" : "implicit-deny") : "implicit-deny",
        );
      }
      for (const action of ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]) {
        expect(
          verdict(env, "plan", action, action === "s3:ListBucket" ? a.artifactsBucket : object),
          action,
        ).not.toBe("allow");
      }
    });
  },
);

describe.each(ENVS)(
  "the names in %s: no role names the other environment, nor a pattern for both",
  (env) => {
    it("every policy of the plan, identity and boundary alike", () => {
      const plan = plans[env] as Plan;
      const violations = policiesOf(plan)
        .filter((policy) => policy.kind === "identity")
        .flatMap((policy) => crossEnvironment(policy.statements, policy.address, env));
      expect(violations).toEqual([]);
    });

    it("the guardian of the principals and the one of the outputs have nothing to say", () => {
      const plan = plans[env] as Plan;
      expect(principalStars(plan)).toEqual([]);
      expect(outputsSensitive(plan, [SUFFIX, SENDER, ADMIN.split("/").pop() as string])).toEqual(
        [],
      );
    });
  },
);

describe.each(ENVS)(
  "the boundary of %s: nobody writes IAM on the bootstrap (rows 4 and 5)",
  (env) => {
    const a = arns(env);
    const withBoundary = {
      "iam:PermissionsBoundary": `arn:aws:iam::${ACCOUNT}:policy/atlas-${env}-boundary`,
    };
    const writes = [
      "iam:UpdateAssumeRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:DeleteRole",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateRole",
      "iam:PutRolePermissionsBoundary",
    ];

    it("denies every IAM write on admin, deploy and plan, for any role that carries it, the API's included", () => {
      const boundary = boundaryOf(plans[env] as Plan);
      for (const action of writes) {
        for (const name of ["admin", "deploy", "plan"]) {
          expect(
            decide(boundary, {
              action,
              resource: a.role(name),
              context: { ...withBoundary, "aws:RequestedRegion": "us-east-1" },
            }),
            `${action} ${name}`,
          ).toBe("deny");
        }
      }
      for (const action of [
        "iam:CreatePolicyVersion",
        "iam:SetDefaultPolicyVersion",
        "iam:DeletePolicy",
      ]) {
        for (const policy of ["boundary", "deploy-iam"]) {
          const resource = `arn:aws:iam::${ACCOUNT}:policy/atlas-${env}-${policy}`;
          expect(
            decide(boundary, { action, resource, context: { "aws:RequestedRegion": "us-east-1" } }),
            `${action} ${policy}`,
          ).toBe("deny");
        }
      }
    });

    it("still lets the deploy role write the roles it creates, and reads stay open", () => {
      const boundary = boundaryOf(plans[env] as Plan);
      expect(
        decide(boundary, {
          action: "iam:PutRolePolicy",
          resource: a.role("api"),
          context: { ...withBoundary, "aws:RequestedRegion": "us-east-1" },
        }),
      ).toBe("allow");
      expect(
        decide(boundary, {
          action: "iam:GetRole",
          resource: a.role("admin"),
          context: { "aws:RequestedRegion": "us-east-1" },
        }),
      ).toBe("allow");
    });
  },
);
