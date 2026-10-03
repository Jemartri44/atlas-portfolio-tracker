import { describe, expect, it } from "vitest";
import { crossEnvironment, outputsSensitive, policiesOf, principalStars } from "./lib/guardians.js";
import { type Context, decide, type Statement } from "./lib/iam.js";
import { changes, only, type Plan } from "./lib/plan.js";
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
const prodKey = (): Plan => renderEnv("prod", { use_customer_managed_key: true });

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
          verdict(env, "deploy", action, own.distribution, { "aws:ResourceTag/env": env }),
          `${action} on its own`,
        ).toBe("allow");
      }
    });

    it("scenario 2: a foreign resource with no tags: the damage is denied, the tagging is the written hole", () => {
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
      // The hole, with its reason: creating a distribution with tags needs
      // `cloudfront:TagResource` while `aws:ResourceTag/env` does not exist yet, so the
      // same call on an untagged resource of another project cannot be told apart from
      // a creation. It is not between dev and prod (every resource of prod carries its
      // env tag, and that is denied above) and it changes nothing but the tag, which
      // gives no power over the resource afterwards.
      expect(
        verdict(env, "deploy", "cloudfront:TagResource", own.distribution, {
          "aws:RequestTag/env": env,
          "aws:TagKeys": ["env", "project", "managed_by"],
        }),
      ).toBe("allow");
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
          expect(verdict(env, "deploy", action, resource, creating), `creating ${action}`).toBe(
            "allow",
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
        const otherKey = { "aws:ResourceTag/env": env, "aws:TagKeys": ["managed_by"] };
        expect(verdict(env, "deploy", action, resource, otherKey), `other key ${action}`).toBe(
          "allow",
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

    it("creates only roles `atlas-<env>-*` and only with its boundary, and cannot remove it or change it", () => {
      const boundary = `arn:aws:iam::${ACCOUNT}:policy/atlas-${env}-boundary`;
      for (const action of ["iam:CreateRole", "iam:PutRolePolicy", "iam:UpdateAssumeRolePolicy"]) {
        expect(
          verdict(env, "deploy", action, own.role("api"), { "iam:PermissionsBoundary": boundary }),
          action,
        ).toBe("allow");
        expect(verdict(env, "deploy", action, own.role("api"), {}), `${action} with none`).not.toBe(
          "allow",
        );
        expect(
          verdict(env, "deploy", action, own.role("api"), {
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
      "prices/alpha-vantage-key",
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

    it("deploy changes the configuration of the data bucket, within what row 6 leaves it", () => {
      for (const action of [
        "s3:PutBucketPolicy",
        "s3:PutBucketVersioning",
        "s3:PutLifecycleConfiguration",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketPublicAccessBlock",
      ]) {
        expect(verdict(env, "deploy", action, a.data), action).toBe("allow");
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

describe("the customer managed key of prod (C2), only when asked for", () => {
  const statements = (): Statement[] =>
    (
      JSON.parse(String(only(prodKey(), "aws_kms_key").change.after?.policy)) as {
        Statement: Statement[];
      }
    ).Statement;

  it("does not exist by default, and rotates when it does", () => {
    expect(
      changes(plans.prod as Plan).filter((change) => change.type.startsWith("aws_kms")),
    ).toEqual([]);
    expect(only(prodKey(), "aws_kms_key").change.after?.enable_key_rotation).toBe(true);
    expect(only(prodKey(), "aws_kms_alias").change.after?.name).toBe("alias/atlas-prod-ssm");
  });

  it("names the administration principal as a real principal, always, so the key is never unmanageable", () => {
    const admin = statements().filter((entry) => entry.Sid === "AdministrationPrincipal");
    expect(admin).toHaveLength(1);
    expect(admin[0]?.Principal).toEqual({ AWS: ADMIN });
    expect(admin[0]?.Effect).toBe("Allow");
  });

  it("names every other principal with Principal * and ArnLike on aws:PrincipalArn, never a role ARN", () => {
    const others = statements().filter((entry) => entry.Sid !== "AdministrationPrincipal");
    expect(others.map((entry) => entry.Sid).sort()).toEqual([
      "AdminRoleEncryptDecrypt",
      "ApiDecrypt",
      "ApiTokensEncrypt",
      "JobsDecrypt",
    ]);
    for (const entry of others) {
      expect(entry.Principal, entry.Sid).toBe("*");
      expect(Object.keys(entry.Condition ?? {}), entry.Sid).toContain("ArnLike");
      expect(JSON.stringify(entry.Condition), entry.Sid).toContain("aws:PrincipalArn");
    }
  });

  it("gives each role what row 8 and the contract say: the API, a context; the tasks, only Decrypt", () => {
    const byPrincipal = (arn: string, action: string, context: Context = {}): string =>
      decide(statements(), { action, principalArn: arn, context });
    const role = (name: string): string => `arn:aws:iam::${ACCOUNT}:role/atlas-prod-${name}`;
    const parameter = `arn:aws:ssm:eu-west-1:${ACCOUNT}:parameter/atlas/prod/device-tokens/*`;
    const tokens: Context = {
      "kms:EncryptionContext:PARAMETER_ARN": parameter.replace("*", "abc"),
    };
    expect(byPrincipal(role("api"), "kms:Decrypt", tokens)).toBe("allow");
    expect(byPrincipal(role("api"), "kms:Encrypt", tokens)).toBe("allow");
    const auth = {
      "kms:EncryptionContext:PARAMETER_ARN": `arn:aws:ssm:eu-west-1:${ACCOUNT}:parameter/atlas/prod/auth/x`,
    };
    // The API reads /auth/* with this key: Decrypt is not limited by path, only Encrypt is.
    expect(byPrincipal(role("api"), "kms:Decrypt", auth)).toBe("allow");
    expect(byPrincipal(role("api"), "kms:Encrypt", auth)).toBe("implicit-deny");
    for (const job of ["job-ecb", "job-prices", "job-mail", "job-backup", "job-integrity"]) {
      expect(byPrincipal(role(job), "kms:Decrypt"), job).toBe("allow");
      expect(byPrincipal(role(job), "kms:Encrypt"), `${job} encrypt`).toBe("implicit-deny");
    }
    for (const stranger of ["deploy", "plan", "worker"]) {
      expect(byPrincipal(role(stranger), "kms:Decrypt", tokens), stranger).toBe("implicit-deny");
    }
    expect(byPrincipal(role("admin"), "kms:Decrypt")).toBe("allow");
    expect(byPrincipal(`arn:aws:iam::${ACCOUNT}:role/atlas-dev-api`, "kms:Decrypt", tokens)).toBe(
      "implicit-deny",
    );
  });
});

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
            decide(boundary, { action, resource: a.role(name), context: withBoundary }),
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
          expect(decide(boundary, { action, resource }), `${action} ${policy}`).toBe("deny");
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
