import {
  type Context,
  type Decision,
  decide,
  flatten,
  type Line,
  lineKey,
  parsePolicy,
  type Request,
  type Statement,
} from "./iam.js";
import { changes, type Plan } from "./plan.js";
import { ACCOUNT, RECIPIENT, SENDER, SUFFIX } from "./renders.js";

/** The statements of a role: its inline policies and the customer policies attached to it. */
export const roleStatements = (plan: Plan, roleName: string): Statement[] => {
  const managed = new Map<string, Statement[]>();
  for (const change of changes(plan)) {
    if (change.type === "aws_iam_policy") {
      managed.set(String(change.change.after?.name), parsePolicy(change.change.after?.policy));
    }
  }
  return changes(plan).flatMap((change): Statement[] => {
    if (change.change.after?.role !== roleName) {
      return [];
    }
    if (change.type === "aws_iam_role_policy") {
      return parsePolicy(change.change.after?.policy);
    }
    if (change.type === "aws_iam_role_policy_attachment") {
      const name = String(change.change.after?.policy_arn).split("/").pop() ?? "";
      const found = managed.get(name);
      if (found === undefined) {
        throw new Error(`${roleName} attaches ${name}, which the plan does not create`);
      }
      return found;
    }
    return [];
  });
};

/** The `aws_iam_role` of the plan, by name. */
export const roleOf = (plan: Plan, roleName: string): Record<string, unknown> => {
  const found = changes(plan).filter(
    (change) => change.type === "aws_iam_role" && change.change.after?.name === roleName,
  );
  if (found.length !== 1) {
    throw new Error(`expected one role ${roleName}, found ${found.length}`);
  }
  return found[0]?.change.after as Record<string, unknown>;
};

export const roleNames = (plan: Plan): string[] =>
  changes(plan)
    .filter((change) => change.type === "aws_iam_role")
    .map((change) => String(change.change.after?.name))
    .sort();

/** One statement of `permissions.json`. */
export interface ContractStatement {
  sid: string;
  effect: "Allow" | "Deny";
  actions?: string[];
  actionsByEnv?: Record<string, string[]>;
  resources: string[];
  condition?: Record<string, Record<string, string | string[]>>;
  contract: string;
  pending?: string;
}

export interface Contract {
  roles: Record<string, { rendered: boolean; statements: ContractStatement[] }>;
}

export const expand = (text: string, env: string): string =>
  text
    .replaceAll("{env}", env)
    .replaceAll("{account}", ACCOUNT)
    .replaceAll("{suffix}", SUFFIX)
    .replaceAll("{sender_host}", SENDER.split("@")[1] ?? "")
    .replaceAll("{sender}", SENDER)
    .replaceAll("{recipient}", RECIPIENT);

const expandDeep = <T>(value: T, env: string): T =>
  JSON.parse(expand(JSON.stringify(value), env)) as T;

/** The statements of a role of the contract, for one environment. */
export const contractStatements = (
  contract: Contract,
  role: string,
  env: string,
  options: { withPending?: boolean } = {},
): Statement[] => {
  const entry = contract.roles[role];
  if (entry === undefined) {
    throw new Error(`the contract has no role ${role}`);
  }
  return entry.statements
    .filter((statement) => options.withPending === true || statement.pending === undefined)
    .map((statement) => {
      const actions = statement.actionsByEnv?.[env] ?? statement.actions ?? [];
      const built: Statement = {
        Sid: statement.sid,
        Effect: statement.effect,
        Action: actions,
        Resource: statement.resources,
      };
      if (statement.condition !== undefined) {
        built.Condition = statement.condition;
      }
      return expandDeep(built, env);
    });
};

export const lineSet = (statements: Statement[]): string[] =>
  flatten(statements)
    .map((line: Line) => lineKey(line))
    .sort();

/**
 * A request that satisfies the conditions a line of a policy carries, so that the
 * boundary can be asked whether it lets that line through.
 */
export const contextOf = (statement: Statement, action: string, extra: Context = {}): Context => {
  const context: Context = { ...extra };
  for (const [operator, pairs] of Object.entries(statement.Condition ?? {})) {
    const base = operator.replace(/^(ForAnyValue:|ForAllValues:)/, "").replace(/IfExists$/, "");
    for (const [key, wanted] of Object.entries(pairs)) {
      const values = Array.isArray(wanted) ? wanted : [wanted];
      if (base === "Null") {
        if (values[0] === "false" && context[key] === undefined) {
          context[key] = "present";
        }
      } else if (/^(Bool|String|Arn)(Equals|Like)$/.test(base)) {
        context[key] = operator.startsWith("For") ? values : values[0]?.replaceAll("*", "x");
      }
    }
  }
  context["aws:RequestedRegion"] ??= regionFor(action);
  return context;
};

/** Where a request for this action is made: the global services answer in us-east-1. */
export const regionFor = (action: string): string =>
  ["acm", "cloudfront", "wafv2", "iam"].includes(action.split(":")[0] ?? "")
    ? "us-east-1"
    : "eu-west-1";

/**
 * What a role may do: its identity policies and its permissions boundary both have
 * to allow it, and an explicit deny in either wins.
 */
export const effective = (
  identity: Statement[],
  boundary: Statement[],
  request: Request,
): Decision => {
  const withRegion: Request = {
    ...request,
    context: { "aws:RequestedRegion": regionFor(request.action), ...request.context },
  };
  const inner = decide(identity, withRegion);
  const outer = decide(boundary, withRegion);
  if (inner === "deny" || outer === "deny") {
    return "deny";
  }
  return inner === "allow" && outer === "allow" ? "allow" : "implicit-deny";
};

/** The boundary of the plan, parsed. */
export const boundaryOf = (plan: Plan): Statement[] => {
  const found = changes(plan).filter(
    (change) =>
      change.type === "aws_iam_policy" && String(change.change.after?.name).endsWith("-boundary"),
  );
  if (found.length !== 1) {
    throw new Error(`expected one boundary, found ${found.length}`);
  }
  return parsePolicy(found[0]?.change.after?.policy);
};
