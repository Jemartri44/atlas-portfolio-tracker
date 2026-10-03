import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  JOB_FAMILIES,
  JOBS_CONFIG_VARIABLES,
  type JobTask,
  parseJobEvent,
  parseJobsConfig,
} from "@atlas/domain/jobs";
import { describe, expect, it } from "vitest";
import { costTypes } from "./lib/cost.js";
import { UNTAGGABLE } from "./lib/exempt.js";
import {
  costTypes as costTypesGuardian,
  crossEnvironment,
  secrets,
  sensitiveInPolicies,
  tags,
  wildcards,
} from "./lib/guardians.js";
import { decide, parsePolicy, type Statement } from "./lib/iam.js";
import { changes, ofType, type Plan } from "./lib/plan.js";
import { ACCOUNT, RECIPIENT, renderEnv, renderStack, SENDER, SUFFIX } from "./lib/renders.js";
import {
  boundaryOf,
  type Contract,
  contractStatements,
  effective,
  lineSet,
  roleOf,
  roleStatements,
} from "./lib/roles.js";
import { infraRoot, repoRoot } from "./lib/terraform.js";

// Z5 (tasks, SES, Scheduler) and Z6 (configuration and events against the parsers of the
// code) of E3, on the rendered plan of `envs/<env>`.

const contract = JSON.parse(
  readFileSync(join(infraRoot, "test", "contract", "permissions.json"), "utf8"),
) as Contract;
const ENVS = ["dev", "prod"] as const;
type Env = (typeof ENVS)[number];
const FAMILIES = ["ecb", "prices", "mail", "backup", "integrity"] as const;
const stack = (env: Env): Plan => renderStack(env);
const doc = (path: string): string => readFileSync(join(repoRoot, path), "utf8");
const code = (path: string): string =>
  readFileSync(join(infraRoot, path), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

/** The instances of a `for_each` resource of the module, by key. */
const byKey = (plan: Plan, type: string): Record<string, Record<string, unknown>> =>
  Object.fromEntries(
    ofType(plan, type)
      .filter((change) => change.index !== undefined)
      .map((change) => [String(change.index), change.change.after as Record<string, unknown>]),
  );
const variablesOf = (fn: Record<string, unknown>): Record<string, string> =>
  (fn.environment as { variables: Record<string, string> }[])[0]?.variables as Record<
    string,
    string
  >;
const roleName = (env: Env, family: string): string => `atlas-${env}-job-${family}`;

// What the documents say, read from the documents and not copied (family 4).
const permissionsDoc = doc("specs/016-scheduled-jobs/contracts/iam-permissions.md");
const eventDoc = doc("specs/016-scheduled-jobs/contracts/scheduler-event.md");
const specification = doc("docs/specification.md");

const sizing = new Map<string, { timeout: number; memory: number }>(
  [
    ...permissionsDoc.matchAll(
      /^\| `atlas-<entorno>-job-(\w+)` \| (\d+) s \| (\d+) MB \| \d+ \|$/gm,
    ),
  ].map((match) => [match[1] as string, { timeout: Number(match[2]), memory: Number(match[3]) }]),
);
const eventTasks = new Map<string, string[]>(
  [...eventDoc.matchAll(/^\| `atlas-<entorno>-job-(\w+)` \| `(\[.*\])` \|$/gm)].map((match) => [
    match[1] as string,
    JSON.parse(match[2] as string) as string[],
  ]),
);
const hours = new Map<string, string>(
  [...specification.matchAll(/`job-(\w+)` \((\d\d:\d\d)\)/g)].map((match) => [
    match[1] as string,
    match[2] as string,
  ]),
);

describe("what the documents say, read from them", () => {
  it("finds the five functions in each table: the tests below would pass on nothing otherwise", () => {
    expect([...sizing.keys()].sort()).toEqual([...FAMILIES].sort());
    expect([...eventTasks.keys()].sort()).toEqual([...FAMILIES].sort());
    expect([...hours.keys()].sort()).toEqual([...FAMILIES].sort());
  });

  it("agrees with the families of the domain", () => {
    expect([...JOB_FAMILIES].sort()).toEqual([...FAMILIES].sort());
  });
});

describe.each(ENVS)("the roles of the task functions of %s", (env) => {
  const plan = stack(env);

  it.each(FAMILIES)("%s: exactly the lines of the contract, no more and no fewer", (family) => {
    const rendered = lineSet(roleStatements(plan, roleName(env, family)));
    const wanted = lineSet(contractStatements(contract, `job-${family}`, env));
    expect(rendered.filter((line) => !wanted.includes(line))).toEqual([]);
    expect(wanted.filter((line) => !rendered.includes(line))).toEqual([]);
    expect(rendered).toHaveLength(wanted.length);
  });

  it("the scheduler role: exactly the contract, lambda:InvokeFunction on the five functions", () => {
    const rendered = lineSet(roleStatements(plan, `atlas-${env}-scheduler`));
    const wanted = lineSet(contractStatements(contract, "scheduler", env));
    expect(rendered.filter((line) => !wanted.includes(line))).toEqual([]);
    expect(wanted.filter((line) => !rendered.includes(line))).toEqual([]);
    expect(
      roleStatements(plan, `atlas-${env}-scheduler`).every(
        (statement) =>
          statement.Effect === "Allow" && statement.Action?.toString() === "lambda:InvokeFunction",
      ),
    ).toBe(true);
  });

  it.each(FAMILIES)(
    "%s: lambda.amazonaws.com exactly as the trust, and the boundary of the environment",
    (family) => {
      const role = roleOf(plan, roleName(env, family));
      expect(role.permissions_boundary).toBe(
        `arn:aws:iam::${ACCOUNT}:policy/atlas-${env}-boundary`,
      );
      const trust = (JSON.parse(String(role.assume_role_policy)) as { Statement: Statement[] })
        .Statement;
      expect(trust).toHaveLength(1);
      expect(trust[0]).toMatchObject({
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Principal: { Service: "lambda.amazonaws.com" },
      });
      expect(trust[0]?.Condition).toBeUndefined();
    },
  );

  it("only the mail role has an ses: action, and it reaches nothing under /prices/ in SSM", () => {
    for (const family of FAMILIES) {
      const statements = roleStatements(plan, roleName(env, family));
      const hasSes = statements.some((s) => [s.Action].flat().some((a) => a?.startsWith("ses:")));
      expect(hasSes, family).toBe(family === "mail");
      const ssmOnPrices = statements.filter(
        (s) =>
          [s.Action].flat().some((a) => a?.startsWith("ssm:")) &&
          [s.Resource].flat().some((r) => String(r).includes("/prices/")),
      );
      expect(ssmOnPrices.length > 0, family).toBe(family === "prices");
    }
    // The mail role: no parameter at all but the two of the mail and the token path.
    const mailSsm = roleStatements(plan, roleName(env, "mail"))
      .filter((s) => [s.Action].flat().some((a) => a?.startsWith("ssm:")))
      .flatMap((s) => [s.Resource].flat());
    expect(mailSsm.sort()).toEqual([
      `arn:aws:ssm:eu-west-1:${ACCOUNT}:parameter/atlas/${env}/device-tokens`,
      `arn:aws:ssm:eu-west-1:${ACCOUNT}:parameter/atlas/${env}/mail/amounts`,
      `arn:aws:ssm:eu-west-1:${ACCOUNT}:parameter/atlas/${env}/mail/recipient`,
    ]);
  });

  it("the sending condition: this sender, API version 2, this recipient and never without one", () => {
    const send = roleStatements(plan, roleName(env, "mail")).find((s) => s.Sid === "Send");
    expect(send).toMatchObject({
      Effect: "Allow",
      Action: ["ses:SendEmail"],
      Resource: [
        `arn:aws:ses:eu-west-1:${ACCOUNT}:identity/${SENDER}`,
        `arn:aws:ses:eu-west-1:${ACCOUNT}:identity/example.invalid`,
      ],
      Condition: {
        StringEquals: { "ses:FromAddress": SENDER, "ses:ApiVersion": "2" },
        "ForAllValues:StringEquals": { "ses:Recipients": [RECIPIENT] },
        Null: { "ses:Recipients": "false" },
      },
    });
    const statements = roleStatements(plan, roleName(env, "mail"));
    const ask = (context: Record<string, string | string[] | undefined>) =>
      decide(statements, {
        action: "ses:SendEmail",
        resource: `arn:aws:ses:eu-west-1:${ACCOUNT}:identity/${SENDER}`,
        context: { "ses:FromAddress": SENDER, "ses:ApiVersion": "2", ...context },
      });
    expect(ask({ "ses:Recipients": [RECIPIENT] })).toBe("allow");
    expect(ask({ "ses:Recipients": ["other@example.invalid"] })).not.toBe("allow");
    expect(ask({ "ses:Recipients": [RECIPIENT, "other@example.invalid"] })).not.toBe("allow");
    expect(ask({ "ses:Recipients": undefined })).not.toBe("allow");
    expect(
      ask({ "ses:Recipients": [RECIPIENT], "ses:FromAddress": "other@example.invalid" }),
    ).not.toBe("allow");
    expect(ask({ "ses:Recipients": [RECIPIENT], "ses:ApiVersion": "1" })).not.toBe("allow");
  });

  it("the recipient of the condition and the one of the parameter come from the same variable", () => {
    const parameter = ofType(plan, "aws_ssm_parameter").find(
      (c) => c.change.after?.name === `/atlas/${env}/mail/recipient`,
    );
    const send = roleStatements(plan, roleName(env, "mail")).find((s) => s.Sid === "Send");
    const condition = send?.Condition?.["ForAllValues:StringEquals"]?.["ses:Recipients"];
    expect(condition).toEqual([parameter?.change.after?.value]);
    // A different recipient moves both, and nothing else changes.
    const other = renderStack(env, { mail_recipient: "someone@example.invalid" });
    const moved = roleStatements(other, roleName(env, "mail")).find((s) => s.Sid === "Send");
    expect(moved?.Condition?.["ForAllValues:StringEquals"]?.["ses:Recipients"]).toEqual([
      "someone@example.invalid",
    ]);
    expect(
      ofType(other, "aws_ssm_parameter").find(
        (c) => c.change.after?.name === `/atlas/${env}/mail/recipient`,
      )?.change.after?.value,
    ).toBe("someone@example.invalid");
  });

  it("the prices role writes the closes and never prices/symbols.json nor prices/config.json", () => {
    const statements = roleStatements(plan, roleName(env, "prices"));
    const bucket = `arn:aws:s3:::atlas-${env}-data-${SUFFIX}`;
    const put = (key: string) =>
      decide(statements, { action: "s3:PutObject", resource: `${bucket}/${key}` });
    expect(put("prices/closes/2026-10.json")).toBe("allow");
    expect(put("prices/_status.json")).toBe("allow");
    expect(put("jobs/prices/prices_update/2026-10-03.json")).toBe("allow");
    expect(put("prices/symbols.json")).toBe("deny");
    expect(put("prices/config.json")).toBe("deny");
    // Not even through the boundary of the environment.
    const boundary = boundaryOf(renderEnv(env));
    expect(
      effective(statements, boundary, {
        action: "s3:PutObject",
        resource: `${bucket}/prices/symbols.json`,
      }),
    ).toBe("deny");
  });

  it("no role of the tasks can delete an object or a parameter, or write a parameter", () => {
    for (const family of FAMILIES) {
      const text = JSON.stringify(roleStatements(plan, roleName(env, family)));
      expect(text, family).not.toMatch(
        /s3:Delete|ssm:Delete|ssm:PutParameter|ssm:LabelParameterVersion|kms:/,
      );
    }
  });

  it("the boundary lets through every line of every task role except the pending ones, and the role of Scheduler too", () => {
    const boundary = boundaryOf(renderEnv(env));
    for (const family of FAMILIES) {
      for (const statement of roleStatements(plan, roleName(env, family))) {
        if (statement.Effect !== "Allow") {
          continue;
        }
        for (const action of [statement.Action].flat()) {
          for (const resource of [statement.Resource].flat()) {
            const decision = effective([statement], boundary, {
              action: action as string,
              resource: resource as string,
              context: contextFor(statement, action as string),
            });
            expect(decision, `${family} ${action} ${resource}`).toBe("allow");
          }
        }
      }
    }
  });

  it("every ARN of the roles is of this environment, and none covers both (family 16)", () => {
    const policies = changes(plan).filter(
      (c) => c.type === "aws_iam_role_policy" && /job|scheduler/.test(c.address),
    );
    expect(policies).toHaveLength(6);
    for (const policy of policies) {
      expect(
        crossEnvironment(parsePolicy(policy.change.after?.policy), policy.address, env),
        policy.address,
      ).toEqual([]);
    }
  });
});

/** A request context that satisfies the conditions a statement carries. */
const contextFor = (
  statement: Statement,
  action: string,
): Record<string, string | string[] | undefined> => {
  const context: Record<string, string | string[] | undefined> = {
    "aws:RequestedRegion": "eu-west-1",
  };
  for (const [operator, pairs] of Object.entries(statement.Condition ?? {})) {
    for (const [key, wanted] of Object.entries(pairs)) {
      const values = [wanted].flat();
      if (operator === "Null") {
        if (values[0] === "false") {
          context[key] ??= "present";
        }
      } else if (operator.startsWith("ForAllValues")) {
        context[key] = values;
      } else {
        context[key] = values[0]?.replaceAll("*", "x");
      }
    }
  }
  expect(action).toBeTruthy();
  return context;
};

describe.each(ENVS)("the functions, logs and invoke configuration of %s", (env) => {
  const plan = stack(env);
  const functions = byKey(plan, "aws_lambda_function");
  const task = (family: string): Record<string, unknown> =>
    functions[family] as Record<string, unknown>;

  it("creates exactly the five functions of the tasks, one artifact, arm64, Node 22, index.handler", () => {
    expect(Object.keys(functions).sort()).toEqual([...FAMILIES].sort());
    for (const family of FAMILIES) {
      expect(task(family), family).toMatchObject({
        function_name: `atlas-${env}-job-${family}`,
        runtime: "nodejs22.x",
        handler: "index.handler",
        architectures: ["arm64"],
        s3_bucket: `atlas-account-artifacts-${SUFFIX}`,
        s3_key: "builds/0000000000000000000000000000000000000000/jobs.zip",
        role: `arn:aws:iam::${ACCOUNT}:role/atlas-${env}-job-${family}`,
      });
    }
  });

  it("time and memory are those of the contract, and ATLAS_JOB_MAX_RUN_SECONDS is the timeout", () => {
    for (const family of FAMILIES) {
      const wanted = sizing.get(family);
      expect(task(family).timeout, family).toBe(wanted?.timeout);
      expect(task(family).memory_size, family).toBe(wanted?.memory);
      expect(variablesOf(task(family)).ATLAS_JOB_MAX_RUN_SECONDS, family).toBe(
        String(task(family).timeout),
      );
    }
  });

  it("reserves exactly 1 execution each, and leaves them open only when asked (C12)", () => {
    for (const family of FAMILIES) {
      expect(task(family).reserved_concurrent_executions, family).toBe(1);
    }
    const open = byKey(
      renderStack(env, { reserve_jobs_concurrency: false }),
      "aws_lambda_function",
    );
    for (const family of FAMILIES) {
      expect(open[family]?.reserved_concurrent_executions, family).toBe(-1);
    }
  });

  it("invokes asynchronously with 0 retries and an event age of 3600 s", () => {
    const configs = byKey(plan, "aws_lambda_function_event_invoke_config");
    expect(Object.keys(configs).sort()).toEqual([...FAMILIES].sort());
    for (const family of FAMILIES) {
      expect(configs[family], family).toMatchObject({
        function_name: `atlas-${env}-job-${family}`,
        maximum_retry_attempts: 0,
        maximum_event_age_in_seconds: 3600,
      });
    }
  });

  it("creates the log group of each one before it, with 30 days in production and 7 in development", () => {
    const groups = byKey(plan, "aws_cloudwatch_log_group");
    for (const family of FAMILIES) {
      expect(groups[family], family).toMatchObject({
        name: `/aws/lambda/atlas-${env}-job-${family}`,
        retention_in_days: env === "prod" ? 30 : 7,
      });
    }
  });

  it.each(FAMILIES)(
    "%s: its variables are exactly the ones its parser accepts, and the code decides",
    (family) => {
      const variables = variablesOf(task(family));
      // The analyser itself decides: an unknown or a missing variable throws.
      const parsed = parseJobsConfig(variables);
      expect(parsed.env).toBe(env);
      expect(parsed.family).toBe(family);
      expect(parsed.dataBucket).toBe(`atlas-${env}-data-${SUFFIX}`);
      expect(parsed.maxRunMs).toBe(Number(task(family).timeout) * 1000);
      expect(Object.keys(variables).sort()).toEqual(
        [
          "ATLAS_ENV",
          "ATLAS_DATA_BUCKET",
          "ATLAS_JOBS",
          "ATLAS_JOB_MAX_RUN_SECONDS",
          ...(JOBS_CONFIG_VARIABLES[family as (typeof JOB_FAMILIES)[number]] ?? []),
        ].sort(),
      );
      expect(() => parseJobsConfig({ ...variables, ATLAS_EXTRA: "1" })).toThrow(/ATLAS_EXTRA/);
      expect(
        Object.keys(variables).filter(
          (k) => /KEY|SECRET|PASSWORD|TOKEN/.test(k) && !/_(SECONDS|DAYS|BYTES|CALLS)$/.test(k),
        ),
      ).toEqual([]);
    },
  );

  it("the mail function names this sender and this origin, and the others know neither", () => {
    const mail = parseJobsConfig(variablesOf(task("mail")));
    expect(mail.mail).toMatchObject({
      from: SENDER,
      origin: "https://atlas.example.invalid",
      idleWarningDays: 150,
    });
    for (const family of FAMILIES.filter((f) => f !== "mail")) {
      expect(Object.keys(variablesOf(task(family))), family).not.toContain("ATLAS_MAIL_FROM");
    }
  });

  it("the prices function: the real sources in production, only the simulated one in development, never both", () => {
    const prices = (
      parseJobsConfig(variablesOf(task("prices"))) as unknown as {
        prices?: { sources: unknown; dailyCalls: unknown; failureThreshold: number };
      }
    ).prices;
    if (env === "prod") {
      expect(prices?.sources).toEqual(["eodhd", "alpha_vantage"]);
      expect(JSON.stringify(variablesOf(task("prices")))).not.toContain("simulated");
    } else {
      expect(prices?.sources).toBe("simulated");
    }
    expect(prices?.dailyCalls).toEqual({ eodhd: 18, alpha_vantage: 23 });
    expect(prices?.failureThreshold).toBe(3);
  });

  it("the integrity function: the ledger warning at 1 MiB", () => {
    expect(
      (
        parseJobsConfig(variablesOf(task("integrity"))) as unknown as {
          integrity?: { ledgerSizeWarningBytes: number };
        }
      ).integrity?.ledgerSizeWarningBytes,
    ).toBe(1_048_576);
  });

  it("no key of a price source and no recipient as a resource of Terraform (family 13)", () => {
    expect(secrets(plan)).toEqual([]);
    expect(ofType(plan, "aws_ssm_parameter").map((c) => c.change.after?.name)).not.toContainEqual(
      expect.stringContaining("/prices/"),
    );
  });
});

describe("the prices function of production refuses the simulated source", () => {
  it("a production plan with it does not even validate", () => {
    expect(() => renderStack("prod", { prices_sources: ["simulated"] })).toThrow(
      /prices_sources is eodhd and\/or alpha_vantage, without repeats/,
    );
  });
});

describe.each(ENVS)("Scheduler of %s", (env) => {
  const plan = stack(env);
  const schedules = byKey(plan, "aws_scheduler_schedule");
  const target = (family: string): Record<string, unknown> =>
    ((schedules[family]?.target as Record<string, unknown>[]) ?? [])[0] as Record<string, unknown>;

  it("has one group, atlas-<env>-jobs, tagged (only the group can be)", () => {
    const groups = ofType(plan, "aws_scheduler_schedule_group");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.change.after).toMatchObject({
      name: `atlas-${env}-jobs`,
      tags_all: { project: "atlas", env, managed_by: "terraform" },
    });
  });

  it("has exactly one daily schedule per function, in the group, in Madrid time, with no flexible window", () => {
    expect(Object.keys(schedules).sort()).toEqual([...FAMILIES].sort());
    for (const family of FAMILIES) {
      expect(schedules[family], family).toMatchObject({
        name: `atlas-${env}-job-${family}`,
        group_name: `atlas-${env}-jobs`,
        schedule_expression_timezone: "Europe/Madrid",
        flexible_time_window: [{ mode: "OFF" }],
      });
    }
  });

  it("runs at the hours of docs/specification.md, none between 02:00 and 03:00", () => {
    for (const family of FAMILIES) {
      const cron = /^cron\((\d+) (\d+) \* \* \? \*\)$/.exec(
        String(schedules[family]?.schedule_expression),
      );
      expect(cron, family).not.toBeNull();
      const time = `${String(cron?.[2]).padStart(2, "0")}:${String(cron?.[1]).padStart(2, "0")}`;
      expect(time, family).toBe(hours.get(family));
      const hour = Number(cron?.[2]);
      expect(hour === 2, family).toBe(false);
    }
  });

  it("retries twice and drops an event older than an hour", () => {
    for (const family of FAMILIES) {
      expect(target(family).retry_policy, family).toEqual([
        { maximum_event_age_in_seconds: 3600, maximum_retry_attempts: 2 },
      ]);
    }
  });

  it("the Input is the one of scheduler-event.md, exactly, and the parser of the function accepts it", () => {
    const functions = byKey(plan, "aws_lambda_function");
    for (const family of FAMILIES) {
      const input = JSON.parse(String(target(family).input)) as unknown;
      expect(input, family).toEqual({ event_format: 1, tasks: eventTasks.get(family) });
      // Exactly two keys, in the order of the contract.
      expect(String(target(family).input), family).toMatch(/^\{"event_format":1,"tasks":\[/);
      const allowed = String(
        variablesOf(functions[family] as Record<string, unknown>).ATLAS_JOBS,
      ).split(",") as JobTask[];
      expect(parseJobEvent(input, allowed), family).toEqual({
        ok: true,
        tasks: eventTasks.get(family),
      });
      expect(allowed, family).toEqual(eventTasks.get(family));
    }
  });

  it("targets the function of its own family with the role of Scheduler of this environment", () => {
    for (const family of FAMILIES) {
      expect(target(family), family).toMatchObject({
        arn: `arn:aws:lambda:eu-west-1:${ACCOUNT}:function:atlas-${env}-job-${family}`,
        role_arn: `arn:aws:iam::${ACCOUNT}:role/atlas-${env}-scheduler`,
      });
    }
  });

  it(
    env === "prod"
      ? "every schedule is ENABLED"
      : "every schedule is DISABLED unless the lever names it, and only that one",
    () => {
      const states = Object.fromEntries(
        FAMILIES.map((family) => [family, schedules[family]?.state]),
      );
      if (env === "prod") {
        expect(Object.values(states)).toEqual(Array(5).fill("ENABLED"));
        return;
      }
      expect(Object.values(states)).toEqual(Array(5).fill("DISABLED"));
      const one = byKey(renderStack("dev", { dev_active_jobs: ["ecb"] }), "aws_scheduler_schedule");
      expect(Object.fromEntries(FAMILIES.map((family) => [family, one[family]?.state]))).toEqual({
        ecb: "ENABLED",
        prices: "DISABLED",
        mail: "DISABLED",
        backup: "DISABLED",
        integrity: "DISABLED",
      });
    },
  );

  it("trusts scheduler.amazonaws.com only for the schedule group of this environment (the ARN of the group, nothing broader)", () => {
    const role = roleOf(plan, `atlas-${env}-scheduler`);
    expect(role.permissions_boundary).toBe(`arn:aws:iam::${ACCOUNT}:policy/atlas-${env}-boundary`);
    const trust = (JSON.parse(String(role.assume_role_policy)) as { Statement: Statement[] })
      .Statement;
    expect(trust).toHaveLength(1);
    expect(trust[0]).toMatchObject({
      Effect: "Allow",
      Action: "sts:AssumeRole",
      Principal: { Service: "scheduler.amazonaws.com" },
      Condition: {
        StringEquals: {
          "aws:SourceArn": `arn:aws:scheduler:eu-west-1:${ACCOUNT}:schedule-group/atlas-${env}-jobs`,
          "aws:SourceAccount": ACCOUNT,
        },
      },
    });
    const text = JSON.stringify(trust);
    expect(text).not.toMatch(/\*|atlas-\*/);
    // The service alone, with no condition, is the confused deputy.
    expect(Object.keys(trust[0]?.Condition ?? {})).toContain("StringEquals");
  });

  it("passes the guardians: tags, closed wildcards, cost.md, and only the mail policy is sensitive", () => {
    expect(tags(plan, { project: "atlas", env, managed_by: "terraform" }, UNTAGGABLE)).toEqual([]);
    expect(
      wildcards(plan, [
        { action: "logs:DescribeLogGroups", source: "Service Authorization Reference" },
        { action: "cloudfront:CreateDistribution", source: "Service Authorization Reference" },
        { action: "cloudfront:CreateFunction", source: "Service Authorization Reference" },
        { action: "acm:RequestCertificate", source: "Service Authorization Reference" },
        {
          action: "ssm:DescribeParameters",
          source: "Service Authorization Reference; provider v6.67.0 parameter.go L317",
        },
      ]),
    ).toEqual([]);
    expect(costTypesGuardian(plan, new Set(costTypes().keys()))).toEqual([]);
    const sensitive = sensitiveInPolicies(plan).map((violation) => violation.address);
    expect(sensitive).toEqual(['module.atlas.aws_iam_role_policy.job["mail"]']);
    expect(sensitiveInPolicies(plan, ['module.atlas.aws_iam_role_policy.job["mail"]'])).toEqual([]);
  });
});

describe("what the code of E3 never says (static)", () => {
  const jobs = code("modules/atlas/jobs.tf");
  const scheduler = code("modules/atlas/scheduler.tf");

  it("has no literal environment, no kms line and no ses outside the mail statement", () => {
    expect(`${jobs}\n${scheduler}`).not.toMatch(/(?<![a-z])(dev|prod)(?![a-z])/);
    expect(jobs).not.toMatch(/kms:/);
    expect(jobs.match(/"ses:SendEmail"/g)).toHaveLength(1);
    expect(jobs).not.toMatch(/ses:\*/);
    expect(scheduler).not.toMatch(/ses:|kms:/);
  });

  it("the state of a schedule only ever comes from the lever, never a literal", () => {
    expect(scheduler.match(/ENABLED/g)).toHaveLength(1);
    expect(scheduler).toMatch(
      /state\s*=\s*contains\(var\.enabled_jobs, each\.key\) \? "ENABLED" : "DISABLED"/,
    );
  });

  it("the roots wire the lever: development from its variable (default none), production all five", () => {
    expect(code("envs/dev/main.tf")).toMatch(/enabled_jobs\s*=\s*var\.dev_active_jobs/);
    expect(code("envs/dev/variables.tf")).toMatch(/dev_active_jobs"[\s\S]*?default\s*=\s*\[\]/);
    expect(code("envs/prod/main.tf")).toMatch(
      /enabled_jobs\s*=\s*\["ecb", "prices", "mail", "backup", "integrity"\]/,
    );
    expect(code("envs/dev/main.tf")).toMatch(/price_sources\s*=\s*\["simulated"\]/);
    expect(code("envs/prod/main.tf")).not.toContain("simulated");
  });

  it("never reads the recipient or the sender from a data source or a literal", () => {
    expect(jobs).not.toMatch(/data\./);
    expect(jobs).toContain("var.mail_recipient");
    expect(jobs).toContain("var.mail_sender");
  });
});
