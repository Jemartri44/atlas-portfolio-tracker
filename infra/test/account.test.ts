import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { costTypes } from "./lib/cost.js";
import { UNTAGGABLE } from "./lib/exempt.js";
import {
  costTypes as costGuardian,
  outputsSensitive,
  policiesOf,
  regions,
  secrets,
  sensitiveInPolicies,
  tags,
  wildcards,
} from "./lib/guardians.js";
import { decide, type Statement } from "./lib/iam.js";
import { changes, only, type Plan } from "./lib/plan.js";
import { ACCOUNT, ADMIN, BUDGET_EMAIL, renderAccount, SENDER, SUFFIX } from "./lib/renders.js";
import { infraRoot } from "./lib/terraform.js";

// Z2, the account: the two buckets and their policies (the resource-side lock), the
// budget, the shared resources and what protects them.

const policyOf = (plan: Plan, name: string): Statement[] =>
  policiesOf(plan).find((policy) => policy.address === `aws_s3_bucket_policy.${name}`)
    ?.statements as Statement[];

const role = (name: string): string => `arn:aws:iam::${ACCOUNT}:role/${name}`;
const state = `arn:aws:s3:::atlas-account-tfstate-${SUFFIX}`;
const artifacts = `arn:aws:s3:::atlas-account-artifacts-${SUFFIX}`;
const secure = { "aws:SecureTransport": "true" };
const hcl = (file: string): string =>
  readFileSync(join(infraRoot, "bootstrap", "account", file), "utf8");
const PROTECTED = /lifecycle \{\s*prevent_destroy = true\s*\}/;

describe("the state bucket (row 15, B2, family 20)", () => {
  const ask = (
    principalArn: string,
    action: string,
    resource: string,
    context: Record<string, string> = {},
  ) =>
    decide(policyOf(renderAccount(), "tfstate"), {
      action,
      resource,
      principalArn,
      context: { ...secure, ...context },
    });

  it("lets dev see only envs/dev/ and prod only envs/prod/, lock files included", () => {
    for (const action of ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]) {
      for (const key of ["terraform.tfstate", "terraform.tfstate.tflock"]) {
        for (const [who, theirs, ours] of [
          ["atlas-dev-deploy", "prod", "dev"],
          ["atlas-dev-plan", "prod", "dev"],
          ["atlas-prod-deploy", "dev", "prod"],
          ["atlas-prod-plan", "dev", "prod"],
        ] as const) {
          expect(ask(role(who), action, `${state}/envs/${theirs}/${key}`), `${who} ${action}`).toBe(
            "deny",
          );
          expect(
            ask(role(who), action, `${state}/envs/${ours}/${key}`),
            `${who} ${action}`,
          ).not.toBe("deny");
        }
      }
    }
  });

  it("does not let in a role the deploy creates (atlas-prod-*): only deploy and plan", () => {
    expect(
      ask(role("atlas-prod-api"), "s3:GetObject", `${state}/envs/prod/terraform.tfstate`),
    ).toBe("deny");
    expect(ask(role("atlas-dev-api"), "s3:GetObject", `${state}/envs/dev/terraform.tfstate`)).toBe(
      "deny",
    );
    expect(ask(role("another-project"), "s3:GetObject", `${state}/x`)).toBe("deny");
  });

  it("refuses a listing outside the prefix of the role", () => {
    expect(ask(role("atlas-dev-plan"), "s3:ListBucket", state, { "s3:prefix": "envs/prod/" })).toBe(
      "deny",
    );
    expect(
      ask(role("atlas-dev-plan"), "s3:ListBucket", state, { "s3:prefix": "envs/dev/" }),
    ).not.toBe("deny");
    expect(ask(role("atlas-prod-plan"), "s3:ListBucket", state, { "s3:prefix": "envs/dev/" })).toBe(
      "deny",
    );
    expect(ask(role("atlas-prod-plan"), "s3:ListBucket", state, { "s3:prefix": "" })).toBe("deny");
  });

  it("never leaves out the administration principal: the user applies this bootstrap again", () => {
    const requests: [string, string, Record<string, string>][] = [
      ["s3:GetObject", `${state}/envs/prod/terraform.tfstate`, {}],
      ["s3:PutObject", `${state}/envs/dev/terraform.tfstate.tflock`, {}],
      ["s3:DeleteObject", `${state}/envs/prod/terraform.tfstate.tflock`, {}],
      ["s3:ListBucket", state, { "s3:prefix": "" }],
      ["s3:ListBucket", state, { "s3:prefix": "envs/prod/" }],
      ["s3:GetBucketPolicy", state, {}],
      ["s3:PutBucketPolicy", state, {}],
      ["s3:PutBucketVersioning", state, {}],
      ["s3:PutEncryptionConfiguration", state, {}],
    ];
    for (const [action, resource, context] of requests) {
      expect(ask(ADMIN, action, resource, context), `${action} ${resource}`).not.toBe("deny");
    }
    expect(ask(role("atlas-dev-deploy"), "s3:PutBucketPolicy", state)).toBe("deny");
  });

  it("denies plain HTTP", () => {
    const request = {
      action: "s3:GetObject",
      resource: `${state}/x`,
      principalArn: ADMIN,
      context: { "aws:SecureTransport": "false" },
    };
    expect(decide(policyOf(renderAccount(), "tfstate"), request)).toBe("deny");
  });

  it("is versioned, private, never force-destroyed, and keeps prevent_destroy (read from the HCL)", () => {
    const plan = renderAccount();
    expect(
      JSON.stringify(only(plan, "aws_s3_bucket_versioning", "tfstate").change.after),
    ).toContain('"status":"Enabled"');
    expect(only(plan, "aws_s3_bucket", "tfstate").change.after?.force_destroy).toBe(false);
    expect(only(plan, "aws_s3_bucket", "tfstate").change.after?.bucket).toBe(
      `atlas-account-tfstate-${SUFFIX}`,
    );
    expect(
      JSON.stringify(
        only(plan, "aws_s3_bucket_server_side_encryption_configuration", "tfstate").change.after,
      ),
    ).toContain("AES256");
    expect(only(plan, "aws_s3_bucket_public_access_block", "tfstate").change.after).toMatchObject({
      block_public_acls: true,
      block_public_policy: true,
      ignore_public_acls: true,
      restrict_public_buckets: true,
    });
    const block =
      /resource "aws_s3_bucket" "tfstate" \{[\s\S]*?\n\}\n/.exec(hcl("main.tf"))?.[0] ?? "";
    expect(block).toMatch(PROTECTED);
  });
});

describe("the artifacts bucket (B6): the lock of promoting what dev built", () => {
  const ask = (principalArn: string, action: string, resource: string) =>
    decide(policyOf(renderAccount(), "artifacts"), {
      action,
      resource,
      principalArn,
      context: secure,
    });
  const object = `${artifacts}/abc1234/jobs.zip`;

  it("is written only by atlas-dev-deploy (and the administration principal)", () => {
    for (const action of [
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:AbortMultipartUpload",
    ]) {
      expect(ask(role("atlas-dev-deploy"), action, object), action).not.toBe("deny");
      expect(ask(ADMIN, action, object), action).not.toBe("deny");
      for (const stranger of [
        "atlas-prod-deploy",
        "atlas-prod-plan",
        "atlas-dev-plan",
        "atlas-dev-api",
        "another-project",
      ]) {
        expect(ask(role(stranger), action, object), `${stranger} ${action}`).toBe("deny");
      }
    }
  });

  it("is read by the two deploy roles and nobody else", () => {
    for (const action of ["s3:GetObject", "s3:GetObjectVersion"]) {
      expect(ask(role("atlas-prod-deploy"), action, object)).not.toBe("deny");
      expect(ask(role("atlas-dev-deploy"), action, object)).not.toBe("deny");
      expect(ask(role("atlas-prod-plan"), action, object)).toBe("deny");
      expect(ask(role("atlas-dev-plan"), action, object)).toBe("deny");
    }
    expect(ask(role("atlas-prod-deploy"), "s3:ListBucket", artifacts)).not.toBe("deny");
    expect(ask(role("atlas-dev-plan"), "s3:ListBucket", artifacts)).toBe("deny");
  });

  it("denies everything else to any principal that is not a deploy role or the administrator", () => {
    for (const action of [
      "s3:ReplicateObject",
      "s3:ReplicateDelete",
      "s3:PutBucketTagging",
      "s3:PutReplicationConfiguration",
      "s3:PutBucketObjectLockConfiguration",
      "s3:GetObject",
      "s3:ListBucket",
    ]) {
      expect(ask(role("another-project"), action, object), action).toBe("deny");
      expect(ask(role("atlas-dev-plan"), action, object), `plan ${action}`).toBe("deny");
    }
    expect(ask(role("atlas-prod-deploy"), "s3:GetObject", object)).not.toBe("deny");
  });

  it("expires what is old (90 days, 30 noncurrent, 7 for multipart) and is versioned, not force-destroyed", () => {
    const plan = renderAccount();
    const rule = JSON.stringify(
      only(plan, "aws_s3_bucket_lifecycle_configuration", "artifacts").change.after,
    );
    expect(rule).toContain('"days":90');
    expect(rule).toContain('"noncurrent_days":30');
    expect(rule).toContain('"days_after_initiation":7');
    expect(rule).toContain('"status":"Enabled"');
    expect(
      JSON.stringify(only(plan, "aws_s3_bucket_versioning", "artifacts").change.after),
    ).toContain('"status":"Enabled"');
    expect(only(plan, "aws_s3_bucket", "artifacts").change.after?.force_destroy).toBe(false);
  });
});

describe("the budget atlas-cost (row 9)", () => {
  const budget = (over = {}) =>
    only(renderAccount(over), "aws_budgets_budget", "atlas_cost").change.after as Record<
      string,
      unknown
    >;

  it("is monthly, in dollars, filtered by the tag, before credits and refunds, at 1 USD", () => {
    const after = budget();
    expect(after).toMatchObject({
      name: "atlas-cost",
      budget_type: "COST",
      time_unit: "MONTHLY",
      limit_unit: "USD",
      limit_amount: "1",
    });
    expect(after.cost_filter).toEqual([{ name: "TagKeyValue", values: ["user:project$atlas"] }]);
    expect(after.cost_types).toEqual([
      expect.objectContaining({ include_credit: false, include_refund: false }),
    ]);
  });

  it("goes to 2 USD with the customer key, and warns at 100 % real and forecasted", () => {
    expect(budget({ use_customer_managed_key: true }).limit_amount).toBe("2");
    const found = (budget().notification as Record<string, unknown>[]).map((n) => [
      n.notification_type,
      n.threshold,
      n.threshold_type,
      n.comparison_operator,
    ]);
    expect(found.sort()).toEqual([
      ["ACTUAL", 100, "PERCENTAGE", "GREATER_THAN"],
      ["FORECASTED", 100, "PERCENTAGE", "GREATER_THAN"],
    ]);
  });

  it("takes the address from a sensitive variable, and the account from a plain one", () => {
    const plan = renderAccount();
    expect(plan.configuration.root_module.variables?.budget_alert_email?.sensitive).toBe(true);
    expect(plan.configuration.root_module.variables?.account_id?.sensitive).toBeUndefined();
    const address = only(plan, "aws_budgets_budget", "atlas_cost").address;
    expect(
      plan.configuration.root_module.resources?.find((r) => r.address === address)
        ?.provider_config_key,
    ).toBe("aws.us_east_1");
  });

  it("activates the tag only in the second pass, and only when asked", () => {
    expect(changes(renderAccount()).filter((c) => c.type === "aws_ce_cost_allocation_tag")).toEqual(
      [],
    );
    expect(
      only(renderAccount({ cost_tag_activation: "terraform" }), "aws_ce_cost_allocation_tag").change
        .after,
    ).toMatchObject({ tag_key: "project", status: "Active" });
  });
});

describe("the shared resources: created only when the variable says so, and protected (rows 11, 12, 14)", () => {
  const types = (plan: Plan): string[] => changes(plan).map((c) => c.type);

  it("with the defaults creates no OIDC provider and no analyzer, and the sender identity only", () => {
    const plan = renderAccount();
    expect(types(plan)).not.toContain("aws_iam_openid_connect_provider");
    expect(types(plan)).not.toContain("aws_accessanalyzer_analyzer");
    expect(
      changes(plan)
        .filter((c) => c.type === "aws_sesv2_email_identity")
        .map((c) => c.address),
    ).toEqual(["aws_sesv2_email_identity.sender[0]"]);
  });

  it("creates each one when the variable says create, tagged as shared", () => {
    const plan = renderAccount({
      github_oidc_provider_mode: "create",
      access_analyzer_mode: "create",
    });
    expect(only(plan, "aws_iam_openid_connect_provider").change.after).toMatchObject({
      url: "https://token.actions.githubusercontent.com",
      client_id_list: ["sts.amazonaws.com"],
    });
    expect(only(plan, "aws_accessanalyzer_analyzer").change.after).toMatchObject({
      type: "ACCOUNT",
    });
    for (const type of ["aws_iam_openid_connect_provider", "aws_accessanalyzer_analyzer"]) {
      expect(only(plan, type).change.after?.tags_all).toMatchObject({
        shared: "true",
        project: "atlas",
      });
    }
  });

  it("verifies the recipient only in the sandbox, and the sender only if it does not exist yet", () => {
    expect(
      changes(renderAccount({ ses_verify_recipient_identity: true })).filter(
        (c) => c.type === "aws_sesv2_email_identity",
      ),
    ).toHaveLength(2);
    expect(
      changes(renderAccount({ ses_create_sender_identity: false })).filter(
        (c) => c.type === "aws_sesv2_email_identity",
      ),
    ).toEqual([]);
  });

  it("gives every shared resource prevent_destroy and a count that a variable decides (read from the HCL)", () => {
    const text = hcl("main.tf");
    for (const type of [
      "aws_iam_openid_connect_provider",
      "aws_accessanalyzer_analyzer",
      "aws_sesv2_email_identity",
    ]) {
      const blocks = [
        ...text.matchAll(new RegExp(`resource "${type}" "\\w+" \\{[\\s\\S]*?\\n\\}\\n`, "g")),
      ].map((m) => m[0]);
      expect(blocks.length, type).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block, type).toMatch(PROTECTED);
        expect(block, type).toMatch(/count\s*=\s*var\.\w+/);
      }
    }
  });
});

describe("what every guardian says about the account part", () => {
  const full = (): Plan =>
    renderAccount({
      github_oidc_provider_mode: "create",
      access_analyzer_mode: "create",
      ses_verify_recipient_identity: true,
      cost_tag_activation: "terraform",
    });

  it("has no wildcard, no secret, no sensitive policy, every tag and every region right", () => {
    const p = full();
    expect(wildcards(p, [])).toEqual([]);
    expect(secrets(p)).toEqual([]);
    expect(sensitiveInPolicies(p)).toEqual([]);
    expect(tags(p, { project: "atlas", managed_by: "terraform" }, UNTAGGABLE)).toEqual([]);
    expect(
      regions(
        p,
        "eu-west-1",
        "us-east-1",
        /^aws_(budgets_budget|ce_cost_allocation_tag)$/,
        /^aws_iam_/,
      ),
    ).toEqual([]);
    expect(costGuardian(p, new Set(costTypes().keys()))).toEqual([]);
  });

  it("marks every output that carries the suffix or an address as sensitive, and has no env tag", () => {
    const p = full();
    expect(outputsSensitive(p, [SUFFIX, SENDER, BUDGET_EMAIL])).toEqual([]);
    expect(Object.keys(p.output_changes ?? {}).sort()).toEqual([
      "artifacts_bucket",
      "tfstate_bucket",
    ]);
    for (const change of changes(p).filter((c) => c.change.after?.tags_all !== undefined)) {
      expect(change.change.after?.tags_all, change.address).not.toHaveProperty("env");
    }
  });
});
