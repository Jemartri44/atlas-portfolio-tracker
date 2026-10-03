import { asArray, parsePolicy, type Statement } from "./iam.js";
import { changes, type Plan, type ResourceChange } from "./plan.js";

/** What a guardian reports: the rule it enforces, where, and why. */
export interface Violation {
  rule: string;
  address: string;
  detail: string;
}

/** The resource types that carry an IAM policy, and the attribute that holds it. */
const POLICY_ATTRIBUTES: Record<string, { attribute: string; kind: PolicyKind }[]> = {
  aws_iam_policy: [{ attribute: "policy", kind: "identity" }],
  aws_iam_role_policy: [{ attribute: "policy", kind: "identity" }],
  aws_iam_role: [{ attribute: "assume_role_policy", kind: "trust" }],
  aws_s3_bucket_policy: [{ attribute: "policy", kind: "resource" }],
  aws_kms_key: [{ attribute: "policy", kind: "key" }],
  aws_lambda_permission: [],
};

export type PolicyKind = "identity" | "trust" | "resource" | "key";

export interface PolicyDocument {
  address: string;
  type: string;
  kind: PolicyKind;
  statements: Statement[];
}

/** Every policy of the plan, parsed; a resource with an inline policy counts too. */
export const policiesOf = (plan: Plan): PolicyDocument[] =>
  changes(plan).flatMap((change): PolicyDocument[] => {
    const found: PolicyDocument[] = [];
    for (const { attribute, kind } of POLICY_ATTRIBUTES[change.type] ?? []) {
      const value = change.change.after?.[attribute];
      if (typeof value === "string" && value !== "") {
        found.push({
          address: change.address,
          type: change.type,
          kind,
          statements: parsePolicy(value),
        });
      }
    }
    if (change.type === "aws_iam_role") {
      for (const inline of asArray(
        change.change.after?.inline_policy as { policy?: string }[] | undefined,
      )) {
        if (typeof inline.policy === "string") {
          found.push({
            address: `${change.address}#inline_policy`,
            type: change.type,
            kind: "identity",
            statements: parsePolicy(inline.policy),
          });
        }
      }
    }
    return found;
  });

const deepTrue = (value: unknown): boolean => {
  if (value === true) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(deepTrue);
  }
  return value !== null && typeof value === "object" && Object.values(value).some(deepTrue);
};

export interface StarAllowance {
  action: string;
  /** Where AWS says the action takes no resource (Service Authorization Reference). */
  source: string;
}

/**
 * Family 11. In every `Allow`: no `Action: "*"`, no `<service>:*`, no
 * `NotAction`/`NotResource`; `Resource: "*"` only for the closed list of
 * actions that take no resource, each with its source; no AWS-managed policy.
 * Key policies write `Resource: "*"` by definition (it means "this key") and
 * are exempt from that last part only.
 */
export const wildcards = (plan: Plan, allowed: StarAllowance[]): Violation[] => {
  const violations: Violation[] = [];
  const closed = new Set(allowed.map((entry) => entry.action.toLowerCase()));
  for (const policy of policiesOf(plan)) {
    for (const statement of policy.statements) {
      if (statement.Effect !== "Allow") {
        continue;
      }
      const where = `${policy.address}${statement.Sid === undefined ? "" : `/${statement.Sid}`}`;
      if (statement.NotAction !== undefined || statement.NotResource !== undefined) {
        violations.push({
          rule: "wildcard",
          address: where,
          detail: "NotAction/NotResource in an Allow",
        });
      }
      const actions = asArray(statement.Action);
      for (const action of actions) {
        if (action === "*" || /^[a-z0-9-]+:\*$/i.test(action)) {
          violations.push({ rule: "wildcard", address: where, detail: `action ${action}` });
        }
      }
      if (policy.kind === "key" || policy.kind === "trust") {
        continue;
      }
      if (asArray(statement.Resource).some((resource) => resource === "*")) {
        for (const action of actions.filter((candidate) => !closed.has(candidate.toLowerCase()))) {
          violations.push({
            rule: "wildcard",
            address: where,
            detail: `Resource "*" for ${action}`,
          });
        }
      }
    }
  }
  for (const change of changes(plan)) {
    if (
      change.type === "aws_iam_role_policy_attachment" ||
      change.type === "aws_iam_policy_attachment"
    ) {
      violations.push({
        rule: "wildcard",
        address: change.address,
        detail: `managed policy ${String(change.change.after?.policy_arn)}`,
      });
    }
    const managed = change.change.after?.managed_policy_arns;
    if (change.type === "aws_iam_role" && Array.isArray(managed) && managed.length > 0) {
      violations.push({ rule: "wildcard", address: change.address, detail: "managed_policy_arns" });
    }
  }
  return violations;
};

/** A policy that is not an inline one of a role: `inline_policy` blocks are not used. */
export const inlinePolicies = (plan: Plan): Violation[] =>
  changes(plan)
    .filter(
      (change) =>
        change.type === "aws_iam_role" &&
        asArray(change.change.after?.inline_policy as unknown[] | undefined).length > 0,
    )
    .map((change) => ({
      rule: "inline-policy",
      address: change.address,
      detail: "inline_policy block: policies go in aws_iam_role_policy",
    }));

/** Allow with `Principal: "*"` only when the statement is conditioned on `aws:PrincipalArn`. */
export const principalStars = (plan: Plan): Violation[] =>
  policiesOf(plan).flatMap((policy) =>
    policy.statements
      .filter((statement) => statement.Effect === "Allow" && statement.Principal === "*")
      .filter((statement) => {
        const keys = Object.values(statement.Condition ?? {}).flatMap((pairs) =>
          Object.keys(pairs),
        );
        return !keys.includes("aws:PrincipalArn");
      })
      .map((statement) => ({
        rule: "principal-star",
        address: `${policy.address}/${statement.Sid ?? ""}`,
        detail: 'Allow with Principal "*" and no aws:PrincipalArn condition',
      })),
  );

/** Family 11, second half: nothing sensitive may enter a policy (it would hide in the plan). */
export const sensitiveInPolicies = (plan: Plan): Violation[] =>
  changes(plan).flatMap((change) =>
    (POLICY_ATTRIBUTES[change.type] ?? [])
      .filter(({ attribute }) => deepTrue(change.change.after_sensitive?.[attribute]))
      .map(({ attribute }) => ({
        rule: "sensitive-in-policy",
        address: change.address,
        detail: `${attribute} is built from a sensitive value`,
      })),
  );

const SECRET_NAME = /(secret|token|password|passwd|api_?key|private_?key|credential)/i;

/** Family 13: no secret in the plan, hence none in the state. */
export const secrets = (plan: Plan): Violation[] => {
  const violations: Violation[] = [];
  for (const change of changes(plan)) {
    if (change.type === "aws_ssm_parameter" && change.change.after?.type === "SecureString") {
      violations.push({
        rule: "secret",
        address: change.address,
        detail: "a SecureString resource",
      });
    }
    if (change.type === "aws_ssm_parameter" && change.change.after?.type !== "String") {
      violations.push({
        rule: "secret",
        address: change.address,
        detail: "an aws_ssm_parameter that is not String",
      });
    }
    if (change.type === "aws_lambda_function") {
      const environment = asArray(
        change.change.after?.environment as { variables?: Record<string, string> }[],
      );
      for (const block of environment) {
        for (const name of Object.keys(block.variables ?? {})) {
          if (SECRET_NAME.test(name)) {
            violations.push({
              rule: "secret",
              address: change.address,
              detail: `environment variable ${name}`,
            });
          }
        }
      }
    }
  }
  for (const resource of plan.configuration.root_module.resources ?? []) {
    if (resource.mode === "data" && /^aws_ssm_parameter(s_by_path)?$/.test(resource.type)) {
      violations.push({
        rule: "secret",
        address: resource.address,
        detail: "a data source that reads SSM",
      });
    }
    if (resource.mode === "data" && /^aws_secretsmanager/.test(resource.type)) {
      violations.push({
        rule: "secret",
        address: resource.address,
        detail: "a data source that reads a secret",
      });
    }
  }
  for (const name of Object.keys(plan.configuration.root_module.variables ?? {})) {
    if (SECRET_NAME.test(name)) {
      violations.push({
        rule: "secret",
        address: `var.${name}`,
        detail: "a variable that looks like a secret",
      });
    }
  }
  return violations;
};

/**
 * Family 12: every resource that can carry tags carries the expected ones in
 * `tags_all`. A resource without a `tags_all` attribute cannot, and is listed
 * in `exempt` with its reason (the caller writes the list).
 */
export const tags = (
  plan: Plan,
  expected: Record<string, string>,
  exempt: Record<string, string>,
): Violation[] =>
  changes(plan)
    .filter((change) => change.change.actions.some((action) => action !== "no-op"))
    .filter((change) => change.mode === "managed" && !(change.type in exempt))
    .flatMap((change): Violation[] => {
      const after = change.change.after ?? {};
      if (!("tags_all" in after) && !("tags_all" in change.change.after_unknown)) {
        return [
          {
            rule: "tags",
            address: change.address,
            detail: `${change.type} has no tags_all and is not in the list of exceptions`,
          },
        ];
      }
      const actual = (after.tags_all ?? {}) as Record<string, string>;
      return Object.entries(expected)
        .filter(([key, value]) => actual[key] !== value)
        .map(([key, value]) => ({
          rule: "tags",
          address: change.address,
          detail: `${key} should be ${value}, is ${String(actual[key])}`,
        }));
    });

/** The region of the provider that a resource uses. */
export const regionOf = (plan: Plan, address: string): string => {
  const resource = (plan.configuration.root_module.resources ?? []).find(
    (entry) => entry.address === address,
  );
  const key = resource?.provider_config_key ?? "aws";
  const expression = plan.configuration.provider_config[key]?.expressions?.region as
    | { constant_value?: string; references?: string[] }
    | undefined;
  if (expression?.constant_value !== undefined) {
    return expression.constant_value;
  }
  const variable = expression?.references?.[0]?.replace(/^var\./, "");
  const value = variable === undefined ? undefined : plan.variables[variable]?.value;
  if (typeof value !== "string") {
    throw new Error(`region of ${address} cannot be read from the plan`);
  }
  return value;
};

/** Family 19: which regions each type may live in. A type not listed fails. */
export const regions = (
  plan: Plan,
  home: string,
  edge: string,
  edgeTypes: RegExp,
  anywhere: RegExp,
): Violation[] =>
  changes(plan)
    .filter((change) => change.mode === "managed")
    .flatMap((change): Violation[] => {
      const region = regionOf(plan, change.address.replace(/\[.*\]$/, ""));
      if (anywhere.test(change.type)) {
        return [];
      }
      const wanted = edgeTypes.test(change.type) ? edge : home;
      return region === wanted
        ? []
        : [
            {
              rule: "region",
              address: change.address,
              detail: `${change.type} is in ${region}, expected ${wanted}`,
            },
          ];
    });

/** Family 5 of §7: a type not in the closed list of `cost.md` fails. */
export const costTypes = (plan: Plan, allowed: ReadonlySet<string>): Violation[] =>
  [
    ...new Set(
      changes(plan)
        .filter((change) => change.mode === "managed")
        .map((change) => change.type),
    ),
  ]
    .filter((type) => !allowed.has(type))
    .map((type) => ({ rule: "cost", address: type, detail: "resource type not in cost.md" }));

/**
 * Outputs that carry the domain, a bucket suffix or an address must be
 * `sensitive` (prompt 017 §12.2 B3); `tokens` are the values of the render.
 */
export const outputsSensitive = (plan: Plan, tokens: string[]): Violation[] =>
  Object.entries(plan.output_changes ?? {})
    .filter(([, output]) => {
      const text = JSON.stringify(output.after ?? null);
      return tokens.some((token) => token !== "" && text.includes(token));
    })
    .filter(([, output]) => output.after_sensitive !== true)
    .map(([name]) => ({
      rule: "output-sensitive",
      address: `output.${name}`,
      detail: "carries a personal value and is not sensitive",
    }));

export const addresses = (violations: Violation[]): string[] =>
  violations.map((violation) => violation.address).sort();

export type { ResourceChange };
