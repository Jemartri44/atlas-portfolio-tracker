import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { costTypes } from "./lib/cost.js";
import { UNTAGGABLE } from "./lib/exempt.js";
import { costTypes as costTypesGuardian, tags, wildcards } from "./lib/guardians.js";
import { decide, type Statement } from "./lib/iam.js";
import { changes, only, type Plan } from "./lib/plan.js";
import { ACCOUNT, ADMIN, REPOSITORY, renderEnv, SENDER } from "./lib/renders.js";
import {
  boundaryOf,
  type Contract,
  contextOf,
  contractStatements,
  lineSet,
  roleNames,
  roleOf,
  roleStatements,
} from "./lib/roles.js";
import { infraRoot } from "./lib/terraform.js";

// Z1, the isolation: the three roles of the bootstrap of an environment, their trust,
// their permissions against the contract, and the boundary every role carries.

const contract = JSON.parse(
  readFileSync(join(infraRoot, "test", "contract", "permissions.json"), "utf8"),
) as Contract;

const ENVS = ["dev", "prod"] as const;
const plans: Record<string, Plan> = {
  get dev() {
    return renderEnv("dev");
  },
  get prod() {
    return renderEnv("prod");
  },
};
const identityCenter = (): Plan => renderEnv("dev", { admin_trust_mode: "identity_center_role" });
const prodKey = (): Plan => renderEnv("prod", { use_customer_managed_key: true });

const trustOf = (plan: Plan, role: string): Statement[] => {
  const document = roleOf(plan, role).assume_role_policy as string;
  return (JSON.parse(document) as { Statement: Statement[] }).Statement;
};

const everyString = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(everyString)
      : value !== null && typeof value === "object"
        ? Object.values(value).flatMap(everyString)
        : [];

describe.each(ENVS)("the roles of the bootstrap of %s", (env) => {
  it("are exactly admin, deploy and plan, each one with the boundary of its environment", () => {
    const plan = plans[env] as Plan;
    expect(roleNames(plan)).toEqual([
      `atlas-${env}-admin`,
      `atlas-${env}-deploy`,
      `atlas-${env}-plan`,
    ]);
    for (const role of roleNames(plan)) {
      expect(roleOf(plan, role).permissions_boundary, role).toBe(
        `arn:aws:iam::${ACCOUNT}:policy/atlas-${env}-boundary`,
      );
    }
    expect(only(plan, "aws_iam_policy", "boundary").change.after?.name).toBe(
      `atlas-${env}-boundary`,
    );
  });

  it("all appear in the contract: a role that is not there fails here, not in the first plan of 018", () => {
    const plan = plans[env] as Plan;
    for (const role of roleNames(plan)) {
      expect(Object.keys(contract.roles), role).toContain(role.replace(`atlas-${env}-`, ""));
    }
  });

  it("have no tag missing, no policy attached from elsewhere and no wildcard but the closed list", () => {
    const plan = plans[env] as Plan;
    expect(tags(plan, { project: "atlas", env, managed_by: "terraform" }, UNTAGGABLE)).toEqual([]);
    expect(
      wildcards(plan, [
        { action: "logs:DescribeLogGroups", source: "Service Authorization Reference" },
      ]),
    ).toEqual([]);
  });
});

describe("the trust of the deploy and plan roles", () => {
  const oidc = `arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com`;

  it.each([
    ["dev", `repo:${REPOSITORY}:ref:refs/heads/develop`],
    ["prod", `repo:${REPOSITORY}:environment:prod`],
  ])("the deploy role of %s accepts exactly one sub, with the audience", (env, sub) => {
    expect(trustOf(plans[env] as Plan, `atlas-${env}-deploy`)).toEqual([
      {
        Sid: "AssumeFromGitHubActions",
        Effect: "Allow",
        Principal: { Federated: oidc },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": sub,
          },
        },
      },
    ]);
  });

  it.each(ENVS)("the plan role of %s accepts the sub of a pull request and nothing else", (env) => {
    const [statement] = trustOf(plans[env] as Plan, `atlas-${env}-plan`);
    expect(statement?.Condition).toEqual({
      StringEquals: {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": `repo:${REPOSITORY}:pull_request`,
      },
    });
  });

  it.each(ENVS)(
    "no trust of %s has a wildcard, a StringLike or an environment in the plan one",
    (env) => {
      for (const role of ["deploy", "plan", "admin"]) {
        const text = JSON.stringify(trustOf(plans[env] as Plan, `atlas-${env}-${role}`));
        expect(text, role).not.toContain("*");
        expect(text, role).not.toContain("StringLike");
        expect(text, role).not.toContain(`${REPOSITORY}:*`);
      }
      expect(JSON.stringify(trustOf(plans[env] as Plan, `atlas-${env}-plan`))).not.toContain(
        "environment",
      );
    },
  );

  it("the deploy roles of the two environments never share a sub", () => {
    const subs = ENVS.map((env) =>
      everyString(trustOf(plans[env] as Plan, `atlas-${env}-deploy`)).filter((text) =>
        text.startsWith("repo:"),
      ),
    );
    expect(subs[0]).not.toEqual(subs[1]);
  });
});

describe("the trust of the administration role (C5)", () => {
  it.each(ENVS)("names the administration principal and requires MFA in %s", (env) => {
    expect(trustOf(plans[env] as Plan, `atlas-${env}-admin`)).toEqual([
      {
        Sid: "AssumeFromTheAdministrationPrincipal",
        Effect: "Allow",
        Principal: { AWS: ADMIN },
        Action: "sts:AssumeRole",
        Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" } },
      },
    ]);
  });

  it("with Identity Center the condition goes away, because that session does not carry the key", () => {
    expect(trustOf(identityCenter(), "atlas-dev-admin")).toEqual([
      {
        Sid: "AssumeFromTheAdministrationPrincipal",
        Effect: "Allow",
        Principal: { AWS: ADMIN },
        Action: "sts:AssumeRole",
      },
    ]);
  });

  it("never trusts the whole account nor a wildcard", () => {
    for (const statements of [
      trustOf(plans.dev as Plan, "atlas-dev-admin"),
      trustOf(identityCenter(), "atlas-dev-admin"),
    ]) {
      const text = JSON.stringify(statements);
      expect(text).not.toContain(":root");
      expect(text).not.toContain('"*"');
    }
  });
});

describe.each(ENVS)(
  "the permissions of the deploy and plan roles of %s against their contract",
  (env) => {
    it.each(["deploy", "plan"])(
      "%s: exactly the lines of the contract, no more and no fewer",
      (role) => {
        const rendered = lineSet(roleStatements(plans[env] as Plan, `atlas-${env}-${role}`));
        const wanted = lineSet(contractStatements(contract, role, env));
        expect(rendered.filter((line) => !wanted.includes(line))).toEqual([]);
        expect(wanted.filter((line) => !rendered.includes(line))).toEqual([]);
        expect(rendered).toHaveLength(wanted.length);
      },
    );

    it("the plan role has no policy attached: ReadOnlyAccess, or any other, cannot slip in", () => {
      const plan = plans[env] as Plan;
      const attached = changes(plan).filter(
        (change) =>
          change.type.endsWith("_attachment") && change.change.after?.role === `atlas-${env}-plan`,
      );
      expect(attached).toEqual([]);
      expect(roleOf(plan, `atlas-${env}-plan`).managed_policy_arns ?? []).toEqual([]);
    });

    it("the deploy role carries only customer policies of Atlas, four, each below the 6,144 limit", () => {
      const plan = plans[env] as Plan;
      const attached = changes(plan)
        .filter((change) => change.type === "aws_iam_role_policy_attachment")
        .map((change) => String(change.change.after?.policy_arn))
        .sort();
      expect(attached).toEqual(
        ["edge", "iam", "read", "workload"].map(
          (part) => `arn:aws:iam::${ACCOUNT}:policy/atlas-${env}-deploy-${part}`,
        ),
      );
      for (const policy of changes(plan).filter((change) => change.type === "aws_iam_policy")) {
        expect(String(policy.change.after?.policy).length, policy.address).toBeLessThan(6144);
      }
      for (const change of changes(plan).filter(
        (change) => change.type === "aws_iam_role_policy",
      )) {
        expect(String(change.change.after?.policy).length, change.address).toBeLessThan(10240);
      }
    });
  },
);

describe.each(ENVS)("the permissions boundary of %s", (env) => {
  let boundary: Statement[];
  beforeAll(() => {
    boundary = boundaryOf(plans[env] as Plan);
  });
  const fn = `arn:aws:lambda:eu-west-1:${ACCOUNT}:function:atlas-${env}-api`;
  const other = env === "dev" ? "prod" : "dev";

  it("fits in a managed policy and has an explicit region in every Allow", () => {
    const text = JSON.stringify({ Version: "2012-10-17", Statement: boundary });
    expect(text.length).toBeLessThan(6144);
    for (const statement of boundary.filter((entry) => entry.Effect === "Allow")) {
      expect(JSON.stringify(statement.Condition), statement.Sid).toContain("aws:RequestedRegion");
    }
  });

  it("denies, explicitly, what row 4 excludes: organizations, account, billing", () => {
    for (const action of [
      "organizations:ListAccounts",
      "organizations:CreateAccount",
      "account:GetContactInformation",
      "billing:GetBillingData",
      "ce:GetCostAndUsage",
      "budgets:ModifyBudget",
      "aws-portal:ViewBilling",
    ]) {
      expect(decide(boundary, { action }), action).toBe("deny");
    }
  });

  it("denies everything outside eu-west-1 and us-east-1, and never lets the edge services in the home region", () => {
    const context = { "aws:RequestedRegion": "us-west-2" };
    expect(decide(boundary, { action: "lambda:GetFunction", resource: fn, context })).toBe("deny");
    for (const [action, resource] of [
      ["acm:DescribeCertificate", `arn:aws:acm:eu-west-1:${ACCOUNT}:certificate/x`],
      ["cloudfront:GetDistribution", `arn:aws:cloudfront::${ACCOUNT}:distribution/X`],
      ["lambda:GetFunction", fn],
    ] as const) {
      const wrongPlace = action.startsWith("lambda")
        ? { "aws:RequestedRegion": "us-east-1" }
        : { "aws:RequestedRegion": "eu-west-1" };
      expect(decide(boundary, { action, resource, context: wrongPlace }), action).not.toBe("allow");
    }
  });

  it("lets through every line the contract grants to every role that carries it, and its Deny lines are not looked at", () => {
    const missing: string[] = [];
    for (const role of Object.keys(contract.roles)) {
      for (const statement of contractStatements(contract, role, env).filter(
        (entry) => entry.Effect === "Allow",
      )) {
        for (const action of [statement.Action].flat() as string[]) {
          for (const resource of [statement.Resource].flat() as string[]) {
            const request = {
              action,
              ...(resource === "*" ? {} : { resource: resource.replaceAll("*", "x") }),
              context: contextOf(statement, action),
            };
            if (decide(boundary, request) !== "allow") {
              missing.push(`${role} ${action} ${resource}`);
            }
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("covers every role of the prompt: the API, the five tasks, administration, deploy, plan and Scheduler", () => {
    expect(Object.keys(contract.roles).sort()).toEqual(
      [
        "admin",
        "api",
        "deploy",
        "job-backup",
        "job-ecb",
        "job-integrity",
        "job-mail",
        "job-prices",
        "plan",
        "scheduler",
      ].sort(),
    );
  });

  it("lists, as pending, the lines it does not let through yet, so that none is forgotten", () => {
    const pending = Object.entries(contract.roles).flatMap(([role, entry]) =>
      entry.statements
        .filter((statement) => statement.pending !== undefined)
        .map((s) => `${role}/${s.sid}`),
    );
    expect(pending).toEqual(["api/KmsSsm"]);
    for (const action of ["kms:Decrypt", "kms:Encrypt"]) {
      expect(
        decide(boundary, {
          action,
          resource: `arn:aws:kms:eu-west-1:${ACCOUNT}:key/x`,
          context: {
            "kms:ViaService": "ssm.eu-west-1.amazonaws.com",
            "aws:RequestedRegion": "eu-west-1",
          },
        }),
      ).not.toBe("allow");
    }
  });

  it("lets through nothing of the other environment, of other projects or of other services", () => {
    const refused: [string, string, Record<string, string>?][] = [
      ["lambda:GetFunction", fn.replace(`atlas-${env}-`, `atlas-${other}-`)],
      ["s3:GetObject", `arn:aws:s3:::atlas-${other}-data-x/ledger/ledger.jsonl`],
      ["s3:GetObject", "arn:aws:s3:::another-project-data/x"],
      ["ssm:GetParameter", `arn:aws:ssm:eu-west-1:${ACCOUNT}:parameter/atlas/${other}/auth/x`],
      ["ssm:GetParameter", `arn:aws:ssm:eu-west-1:${ACCOUNT}:parameter/other-project/x`],
      ["iam:CreateUser", `arn:aws:iam::${ACCOUNT}:user/atlas-${env}-x`],
      ["iam:AttachRolePolicy", `arn:aws:iam::${ACCOUNT}:role/atlas-${env}-x`],
      ["iam:CreateRole", `arn:aws:iam::${ACCOUNT}:role/atlas-${env}-x`],
      [
        "iam:CreateRole",
        `arn:aws:iam::${ACCOUNT}:role/atlas-${other}-x`,
        {
          "iam:PermissionsBoundary": `arn:aws:iam::${ACCOUNT}:policy/atlas-${env}-boundary`,
        },
      ],
      ["s3:DeleteObject", `arn:aws:s3:::atlas-${env}-data-abc123def456/ledger/ledger.jsonl`],
      [
        "ses:SendEmail",
        `arn:aws:ses:eu-west-1:${ACCOUNT}:identity/someone@example.invalid`,
        {
          "ses:FromAddress": "someone@example.invalid",
        },
      ],
      ["ec2:RunInstances", `arn:aws:ec2:eu-west-1:${ACCOUNT}:instance/i-0`],
      ["sts:AssumeRole", `arn:aws:iam::${ACCOUNT}:role/atlas-${other}-admin`],
    ];
    for (const [action, resource, context] of refused) {
      expect(
        decide(boundary, { action, resource, context: { ...context } }),
        `${action} ${resource}`,
      ).not.toBe("allow");
    }
  });

  it("is the one a role of the other environment cannot use: its lines do not pass", () => {
    const strangers: string[] = [];
    for (const role of Object.keys(contract.roles)) {
      for (const statement of contractStatements(contract, role, other).filter(
        (entry) => entry.Effect === "Allow",
      )) {
        for (const action of [statement.Action].flat() as string[]) {
          for (const resource of [statement.Resource].flat() as string[]) {
            if (resource === "*" || resource.includes(`${ACCOUNT}:role/aws`)) {
              continue;
            }
            const request = {
              action,
              resource: resource.replaceAll("*", "x"),
              context: contextOf(statement, action),
            };
            if (
              decide(boundary, request) === "allow" &&
              /atlas-(dev|prod)-|envs\/(dev|prod)\//.test(resource)
            ) {
              strangers.push(`${role} ${action} ${resource}`);
            }
          }
        }
      }
    }
    // The one documented exception (prompt 017, §12.2 B4): the account buckets are in
    // the boundary by their prefix `atlas-account-*`, and the two environments are kept
    // apart there by the other two locks, the identity policy of each role (one key)
    // and the bucket policy (which denies the other environment's key). Both are tested
    // separately; here they must be the only strangers, and only the state's.
    const outsideTheAccountBuckets = strangers.filter(
      (line) => !line.includes(":::atlas-account-"),
    );
    expect(outsideTheAccountBuckets).toEqual([]);
    expect(strangers.every((line) => line.includes("atlas-account-tfstate-"))).toBe(true);
  });
});

describe("the closed list of costs and the shape of the plans", () => {
  it.each(ENVS)("every resource type of %s is in cost.md", (env) => {
    expect(costTypesGuardian(plans[env] as Plan, new Set(costTypes().keys()))).toEqual([]);
  });

  it("the OAC of each origin is created here and nowhere else", () => {
    const plan = plans.dev as Plan;
    const oac = changes(plan).filter(
      (change) => change.type === "aws_cloudfront_origin_access_control",
    );
    expect(
      oac
        .map((change) => [
          change.change.after?.name,
          change.change.after?.origin_access_control_origin_type,
          change.change.after?.signing_behavior,
          change.change.after?.signing_protocol,
        ])
        .sort(),
    ).toEqual([
      ["atlas-dev-api", "lambda", "always", "sigv4"],
      ["atlas-dev-spa", "s3", "always", "sigv4"],
    ]);
  });

  it("the sender host in the boundary is the host of the sender", () => {
    const text = JSON.stringify(boundaryOf(plans.dev as Plan));
    expect(text).toContain(`identity/${SENDER}`);
    expect(text).toContain(`identity/${SENDER.split("@")[1]}`);
  });

  it("keeps the key of the prod plan when C2 asks for it (the policy of the key is tested apart)", () => {
    expect(changes(prodKey()).filter((change) => change.type === "aws_kms_key")).toHaveLength(1);
  });
});
