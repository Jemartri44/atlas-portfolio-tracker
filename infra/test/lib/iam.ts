/**
 * A small reader of IAM policies for the static analysis (prompt 017 §4, P3).
 *
 * It is **not** an IAM evaluator. Every rule of the suite is a structural
 * claim about a rendered policy, and where a rule needs to ask "would this
 * request pass?" (the permissions boundary against a role's actions, the
 * administration principal against a denial) it uses `decide`, which knows a
 * closed list of condition operators: **an operator it does not know throws**,
 * so the test fails instead of passing by accident.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface Statement {
  Sid?: string;
  Effect: "Allow" | "Deny";
  Principal?: Json;
  NotPrincipal?: Json;
  Action?: string | string[];
  NotAction?: string | string[];
  Resource?: string | string[];
  NotResource?: string | string[];
  Condition?: Record<string, Record<string, string | string[]>>;
}

export const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

export const parsePolicy = (document: unknown): Statement[] => {
  const parsed: unknown = typeof document === "string" ? JSON.parse(document) : document;
  const statements = (parsed as { Statement?: unknown }).Statement;
  if (statements === undefined) {
    throw new Error("a policy without Statement");
  }
  return asArray(statements as Statement | Statement[]);
};

const escapeRegex = (text: string): string => text.replace(/[.+^${}()|[\]\\]/g, "\\$&");

/** `*` and `?` as IAM reads them. */
export const globMatch = (pattern: string, value: string, caseInsensitive = false): boolean =>
  new RegExp(
    `^${escapeRegex(pattern).replace(/\*/g, ".*").replace(/\?/g, ".")}$`,
    caseInsensitive ? "i" : "",
  ).test(value);

export type Context = Record<string, string | string[] | undefined>;

const valuesOf = (context: Context, key: string): string[] | undefined => {
  const value = context[key];
  return value === undefined ? undefined : asArray(value);
};

const SIMPLE: Record<string, (pattern: string, value: string) => boolean> = {
  StringEquals: (p, v) => p === v,
  StringNotEquals: (p, v) => p !== v,
  StringLike: (p, v) => globMatch(p, v),
  StringNotLike: (p, v) => !globMatch(p, v),
  ArnEquals: (p, v) => p === v,
  ArnNotEquals: (p, v) => p !== v,
  ArnLike: (p, v) => globMatch(p, v),
  ArnNotLike: (p, v) => !globMatch(p, v),
  StringEqualsIgnoreCase: (p, v) => p.toLowerCase() === v.toLowerCase(),
};
const NEGATED = new Set(["StringNotEquals", "StringNotLike", "ArnNotEquals", "ArnNotLike"]);

const conditionHolds = (
  operator: string,
  key: string,
  wanted: string[],
  context: Context,
): boolean => {
  if (wanted.some((value) => value.includes("${"))) {
    throw new Error(`unsupported policy variable in ${operator} ${key}`);
  }
  const ifExists = operator.endsWith("IfExists");
  let base = ifExists ? operator.slice(0, -"IfExists".length) : operator;
  let quantifier: "ForAnyValue" | "ForAllValues" | undefined;
  for (const prefix of ["ForAnyValue:", "ForAllValues:"] as const) {
    if (base.startsWith(prefix)) {
      quantifier = prefix.slice(0, -1) as "ForAnyValue" | "ForAllValues";
      base = base.slice(prefix.length);
    }
  }
  const actual = valuesOf(context, key);
  if (base === "Null") {
    const absent = actual === undefined;
    return wanted.some((value) => (value === "true") === absent);
  }
  if (base === "Bool") {
    return actual?.some((value) => wanted.includes(value)) === true;
  }
  const test = SIMPLE[base];
  if (test === undefined) {
    throw new Error(`unsupported condition operator ${operator}`);
  }
  if (actual === undefined) {
    return ifExists || quantifier === "ForAllValues" || NEGATED.has(base);
  }
  const matches = (value: string): boolean =>
    NEGATED.has(base)
      ? wanted.every((pattern) => test(pattern, value))
      : wanted.some((pattern) => test(pattern, value));
  if (quantifier === "ForAllValues") {
    return actual.every(matches);
  }
  return actual.some(matches);
};

export interface Request {
  action: string;
  /** `undefined`: an action that takes no resource. */
  resource?: string;
  context?: Context;
  /** `aws:PrincipalArn` shortcut for resource policies. */
  principalArn?: string;
}

const principalMatches = (statement: Statement, principalArn: string | undefined): boolean => {
  if (statement.Principal === undefined && statement.NotPrincipal === undefined) {
    return true;
  }
  if (statement.NotPrincipal !== undefined) {
    throw new Error("NotPrincipal is not supported by the suite");
  }
  const principal = statement.Principal;
  if (principal === "*") {
    return true;
  }
  const aws = (principal as { AWS?: string | string[] }).AWS;
  if (aws === undefined) {
    return false;
  }
  return asArray(aws).some((arn) => arn === "*" || arn === principalArn);
};

/** Does this one statement apply to the request? */
export const applies = (statement: Statement, request: Request): boolean => {
  const context: Context = { ...request.context };
  if (request.principalArn !== undefined) {
    context["aws:PrincipalArn"] = request.principalArn;
  }
  if (!principalMatches(statement, request.principalArn)) {
    return false;
  }
  const actions = asArray(statement.Action);
  const notActions = asArray(statement.NotAction);
  const actionHit =
    actions.length > 0
      ? actions.some((pattern) => globMatch(pattern, request.action, true))
      : !notActions.some((pattern) => globMatch(pattern, request.action, true));
  if (!actionHit) {
    return false;
  }
  const resources = asArray(statement.Resource);
  const notResources = asArray(statement.NotResource);
  if (resources.length > 0 || notResources.length > 0) {
    if (request.resource === undefined) {
      if (!resources.includes("*")) {
        return false;
      }
    } else {
      const resource = request.resource;
      const resourceHit =
        resources.length > 0
          ? resources.some((pattern) => globMatch(pattern, resource))
          : !notResources.some((pattern) => globMatch(pattern, resource));
      if (!resourceHit) {
        return false;
      }
    }
  }
  for (const [operator, pairs] of Object.entries(statement.Condition ?? {})) {
    for (const [key, wanted] of Object.entries(pairs)) {
      if (!conditionHolds(operator, key, asArray(wanted), context)) {
        return false;
      }
    }
  }
  return true;
};

export type Decision = "allow" | "deny" | "implicit-deny";

/** An explicit `Deny` wins; otherwise an `Allow`; otherwise nothing allows it. */
export const decide = (statements: Statement[], request: Request): Decision => {
  const hits = statements.filter((statement) => applies(statement, request));
  if (hits.some((statement) => statement.Effect === "Deny")) {
    return "deny";
  }
  return hits.some((statement) => statement.Effect === "Allow") ? "allow" : "implicit-deny";
};

/** A flat, comparable line of a policy: one action on one resource, with its condition. */
export interface Line {
  effect: "Allow" | "Deny";
  action: string;
  resource: string;
  condition: string;
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).sort().join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const flatten = (statements: Statement[]): Line[] =>
  statements.flatMap((statement) => {
    const resources = asArray(statement.Resource ?? statement.NotResource);
    return asArray(statement.Action ?? statement.NotAction).flatMap((action) =>
      (resources.length === 0 ? ["(none)"] : resources).map((resource) => ({
        effect: statement.Effect,
        action,
        resource,
        condition: statement.Condition === undefined ? "" : canonical(statement.Condition),
      })),
    );
  });

export const lineKey = (line: Line): string =>
  `${line.effect} ${line.action} ${line.resource} ${line.condition}`;
