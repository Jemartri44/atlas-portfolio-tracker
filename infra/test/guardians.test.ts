import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { UNTAGGABLE } from "./lib/exempt.js";
import {
  addresses,
  costTypes,
  crossEnvironment,
  inlinePolicies,
  outputsSensitive,
  policiesOf,
  principalStars,
  regionOf,
  regions,
  secrets,
  sensitiveInPolicies,
  tags,
  type Violation,
  wildcards,
} from "./lib/guardians.js";
import { decide, type Statement } from "./lib/iam.js";
import type { Plan, ResourceChange } from "./lib/plan.js";
import { infraRoot, renderPlan } from "./lib/terraform.js";

// Prompt 017 §9, family 1: every guardian reads the RENDERED plan, and each one has to
// see the evasions of Terraform (a wildcard that arrives through a variable, concat(),
// for_each, templatefile(), a dynamic block, an inline policy, a managed policy) by
// the rule that forbids it. The fixtures are real roots, planned with no AWS.

const fixture = (name: string): string => join(infraRoot, "test", "fixtures", name);

const STAR_LIST = [{ action: "logs:DescribeLogGroups", source: "Service Authorization Reference" }];
const TAGS = { project: "atlas", env: "dev", managed_by: "terraform" };
const NO_TAGS = UNTAGGABLE;

const home = "eu-west-1";
const edge = "us-east-1";

let ok: Plan;
let bad: Plan;

beforeAll(() => {
  ok = renderPlan({ root: fixture("compliant"), vars: "" });
  bad = renderPlan({ root: fixture("violations"), vars: "" });
});

const allRules = (plan: Plan, allowedTypes: Set<string>): Violation[] => [
  ...wildcards(plan, STAR_LIST),
  ...inlinePolicies(plan),
  ...principalStars(plan),
  ...sensitiveInPolicies(plan),
  ...secrets(plan),
  ...tags(plan, TAGS, NO_TAGS),
  ...regions(plan, home, edge, /^aws_acm_/, /^aws_iam_/),
  ...costTypes(plan, allowedTypes),
  ...outputsSensitive(plan, ["abc123def456", "personal-value-0001"]),
];

describe("a root that obeys every rule", () => {
  it("makes no guardian say anything", () => {
    const types = new Set((ok.resource_changes ?? []).map((change: ResourceChange) => change.type));
    expect(allRules(ok, types)).toEqual([]);
  });

  it("reads its policies: the role, the bucket and the attached one", () => {
    expect(policiesOf(ok).map((policy) => policy.address)).toEqual(
      expect.arrayContaining([
        "aws_iam_role.worker",
        "aws_iam_role_policy.worker",
        "aws_s3_bucket_policy.data",
      ]),
    );
  });

  it("puts the certificate of the edge in us-east-1 and the rest at home", () => {
    expect(regionOf(ok, "aws_acm_certificate.edge")).toBe(edge);
    expect(regionOf(ok, "aws_s3_bucket.data")).toBe(home);
  });
});

const only = (violations: Violation[], rule: string): Violation[] =>
  violations.filter((violation) => violation.rule === rule);

describe("the battery of evasions, each one seen by its own rule", () => {
  const wildcardCases: [string, string][] = [
    ['aws_iam_role_policy.elusion["star_variable"]', "action \\*"],
    ['aws_iam_role_policy.elusion["star_concat"]', "action iam:\\*"],
    ['aws_iam_role_policy.elusion["star_service"]', "action s3:\\*"],
    ["aws_iam_role_policy.star_template", "action ec2:\\*"],
    ["aws_iam_role_policy.star_resource", 'Resource "\\*" for s3:GetObject'],
    ["aws_iam_role_policy.not_action", "NotAction"],
    ["aws_iam_role.inline_dynamic#inline_policy", "action \\*"],
    ["aws_iam_role_policy_attachment.read_only", "managed policy arn:aws:iam::aws:policy/ReadOnly"],
    [
      "aws_iam_role_policy_attachment.other_project",
      "managed policy arn:aws:iam::111122223333:policy/someone",
    ],
  ];

  it.each(wildcardCases)("the wildcard rule sees %s", (address, detail) => {
    const found = only(wildcards(bad, STAR_LIST), "wildcard").filter(
      (violation) => violation.address === address,
    );
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((violation) => new RegExp(detail).test(violation.detail))).toBe(true);
  });

  it("the inline-policy rule sees the block written plainly and the dynamic one", () => {
    expect(addresses(inlinePolicies(bad))).toEqual([
      "aws_iam_role.inline_dynamic",
      "aws_iam_role.inline_static",
    ]);
  });

  it("the rule of the principal sees the open bucket and nothing else", () => {
    expect(addresses(principalStars(bad))).toEqual(["aws_s3_bucket_policy.open/"]);
  });

  it("the rule of the sensitive values sees the policy built from one", () => {
    expect(addresses(sensitiveInPolicies(bad))).toEqual(["aws_iam_role_policy.sensitive_policy"]);
  });

  it("the rule of the secrets sees the SecureString and the secret-like variables", () => {
    const found = secrets(bad);
    expect(found.every((violation) => violation.rule === "secret")).toBe(true);
    const details = found.map((violation) => `${violation.address} ${violation.detail}`);
    expect(details).toContain("aws_ssm_parameter.secret a SecureString resource");
    expect(details).toContain("aws_lambda_function.leaky environment variable GOOGLE_API_KEY");
    expect(details).toContain("aws_lambda_function.leaky environment variable ATLAS_SESSION_TOKEN");
    expect(details.some((text) => text.includes("ATLAS_ORIGIN"))).toBe(false);
  });

  it("the rule of the tags names the tags that are missing", () => {
    const found = tags(bad, TAGS, NO_TAGS).filter(
      (violation) => violation.address === "aws_sns_topic.unlisted",
    );
    expect(found.map((violation) => violation.detail).sort()).toEqual([
      "env should be dev, is undefined",
      "managed_by should be terraform, is undefined",
    ]);
  });

  it("the rule of the region sees the bucket that is not at home", () => {
    expect(addresses(regions(bad, home, edge, /^aws_acm_/, /^aws_iam_/))).toEqual([
      "aws_s3_bucket.wrong_region",
    ]);
  });

  it("the rule of the cost sees the type that cost.md does not list", () => {
    const listed = new Set((bad.resource_changes ?? []).map((change) => change.type));
    listed.delete("aws_sns_topic");
    expect(addresses(costTypes(bad, listed))).toEqual(["aws_sns_topic"]);
  });

  it("the rule of the outputs sees the one that leaks a personal value", () => {
    expect(addresses(outputsSensitive(bad, ["abc123def456"]))).toEqual(["output.leak"]);
  });
});

describe("the other rules, on plans written by hand", () => {
  const change = (
    type: string,
    after: Record<string, unknown>,
    extra: Partial<ResourceChange> = {},
  ): ResourceChange => ({
    address: `${type}.x`,
    mode: "managed",
    type,
    name: "x",
    provider_name: "registry.terraform.io/hashicorp/aws",
    change: { actions: ["create"], before: null, after, after_unknown: {}, after_sensitive: {} },
    ...extra,
  });
  const plan = (
    resources: ResourceChange[],
    config: Partial<Plan["configuration"]["root_module"]> = {},
    providers: Plan["configuration"]["provider_config"] = {},
  ): Plan => ({
    variables: { region: { value: "eu-west-1" } },
    resource_changes: resources,
    configuration: { provider_config: providers, root_module: config },
  });

  it("refuses the deprecated managed_policy_arns of a role", () => {
    const found = wildcards(
      plan([change("aws_iam_role", { managed_policy_arns: ["arn:aws:iam::aws:policy/X"] })]),
      [],
    );
    expect(found.map((violation) => violation.detail)).toEqual(["managed_policy_arns"]);
  });

  it.each([
    "aws_iam_policy_attachment",
    "aws_iam_user_policy_attachment",
    "aws_iam_group_policy_attachment",
  ])("refuses %s, whatever the policy", (type) => {
    const found = wildcards(
      plan([change(type, { policy_arn: "arn:aws:iam::111122223333:policy/atlas-dev-x" })]),
      [],
    );
    expect(found).toHaveLength(1);
  });

  it("lets a key policy say Resource * (it means this key) but not a wildcard action", () => {
    const key = (action: string): Plan =>
      plan([
        change("aws_kms_key", {
          policy: JSON.stringify({
            Statement: [{ Effect: "Allow", Action: action, Resource: "*", Principal: "*" }],
          }),
        }),
      ]);
    expect(wildcards(key("kms:Decrypt"), [])).toEqual([]);
    expect(wildcards(key("kms:*"), [])).toHaveLength(1);
  });

  it("refuses a data source that reads SSM or a secret, and a variable that looks like one", () => {
    const found = secrets(
      plan([], {
        resources: [
          {
            address: "data.aws_ssm_parameter.x",
            mode: "data",
            type: "aws_ssm_parameter",
            name: "x",
            provider_config_key: "aws",
          },
          {
            address: "data.aws_secretsmanager_secret_version.y",
            mode: "data",
            type: "aws_secretsmanager_secret_version",
            name: "y",
            provider_config_key: "aws",
          },
        ],
        variables: { client_secret: {}, domain: {} },
      }),
    );
    expect(found.map((violation) => violation.detail).sort()).toEqual([
      "a data source that reads SSM",
      "a data source that reads a secret",
      "a variable that looks like a secret",
    ]);
  });

  it("refuses a parameter that is not a String", () => {
    const found = secrets(plan([change("aws_ssm_parameter", { type: "StringList" })]));
    expect(found.map((violation) => violation.detail)).toEqual([
      "an aws_ssm_parameter that is not String",
    ]);
  });

  it("reads the region of a provider from a variable or a constant, and fails on anything else", () => {
    const resource = {
      address: "aws_s3_bucket.x",
      mode: "managed" as const,
      type: "aws_s3_bucket",
      name: "x",
      provider_config_key: "aws",
    };
    const variable = plan(
      [],
      { resources: [resource] },
      {
        aws: { expressions: { region: { references: ["var.region", "var"] } } },
      },
    );
    expect(regionOf(variable, "aws_s3_bucket.x")).toBe("eu-west-1");
    const nothing = plan([], { resources: [resource] }, { aws: { expressions: {} } });
    expect(() => regionOf(nothing, "aws_s3_bucket.x")).toThrow("cannot be read");
  });

  it("flags a resource that has no tags_all and is not an exception", () => {
    const found = tags(plan([change("aws_sns_topic", {})]), TAGS, {});
    expect(found).toHaveLength(1);
    expect(found[0]?.detail).toContain("has no tags_all");
  });
});

describe("the crossing of environments", () => {
  const allow = (resource: string | string[], condition?: Statement["Condition"]): Statement[] => [
    {
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: resource,
      ...(condition === undefined ? {} : { Condition: condition }),
    },
  ];

  it("says nothing about a policy that names only its own environment", () => {
    expect(
      crossEnvironment(
        allow([
          "arn:aws:s3:::atlas-dev-data-abc123/*",
          "arn:aws:s3:::atlas-account-tfstate-abc123/envs/dev/*",
        ]),
        "p",
        "dev",
      ),
    ).toEqual([]);
  });

  it.each([
    "arn:aws:s3:::atlas-prod-data-abc123/*",
    "arn:aws:s3:::atlas-account-tfstate-abc123/envs/prod/*",
    "arn:aws:iam::111122223333:role/atlas-*",
    "arn:aws:iam::111122223333:role/*",
    "arn:aws:ssm:eu-west-1:111122223333:parameter/atlas/*",
  ])("refuses %s in a dev policy", (resource) => {
    expect(crossEnvironment(allow(resource), "p", "dev")).toHaveLength(1);
  });

  it("reads the conditions too, and is symmetric", () => {
    expect(
      crossEnvironment(
        allow("arn:aws:s3:::x", { StringEquals: { "aws:ResourceTag/env": "prod" } }),
        "p",
        "dev",
      ),
    ).toHaveLength(1);
    expect(
      crossEnvironment(allow("arn:aws:s3:::atlas-dev-data-abc123/*"), "p", "prod"),
    ).toHaveLength(1);
  });
});

describe("the reader of policies is not an evaluator, and says so", () => {
  it("refuses a condition operator it does not know, so that the test fails and does not pass", () => {
    const statement: Statement = {
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "*",
      Condition: { DateGreaterThan: { "aws:CurrentTime": "2030-01-01T00:00:00Z" } },
    };
    expect(() => decide([statement], { action: "s3:GetObject", resource: "x" })).toThrow(
      "unsupported condition operator",
    );
  });

  it("refuses a policy variable and NotPrincipal", () => {
    const withVariable: Statement = {
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "*",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: an IAM policy variable is the point
      Condition: { StringEquals: { "aws:username": "${aws:username}" } },
    };
    expect(() => decide([withVariable], { action: "s3:GetObject", resource: "x" })).toThrow(
      "unsupported policy variable",
    );
    const notPrincipal: Statement = {
      Effect: "Deny",
      NotPrincipal: { AWS: "x" },
      Action: "s3:*",
      Resource: "*",
    };
    expect(() => decide([notPrincipal], { action: "s3:GetObject", resource: "x" })).toThrow(
      "NotPrincipal",
    );
  });
});
