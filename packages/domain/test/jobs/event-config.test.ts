// Feature 016, E1: the event of EventBridge Scheduler (R12, mutant 7), the
// configuration of each function (R17), the mail address and the switch of
// the amounts (R4, mutant 2).

import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { isMailAddress } from "../../src/jobs/address.js";
import { amountsSwitch } from "../../src/jobs/amounts.js";
import { parseJobsConfig } from "../../src/jobs/config.js";
import { parseJobEvent } from "../../src/jobs/event.js";

const MAIL = ["dispatch_findings", "monthly_reminder"] as const;

describe("the event of the schedule, read strictly (R12)", () => {
  it("accepts exactly the format and the tasks of this function, in their order", () => {
    expect(
      parseJobEvent({ event_format: 1, tasks: ["dispatch_findings", "monthly_reminder"] }, MAIL),
    ).toEqual({ ok: true, tasks: ["dispatch_findings", "monthly_reminder"] });
  });

  it("refuses anything else with its own reason, and never by the prototype", () => {
    const cases: [unknown, string][] = [
      ["{}", "not_an_object"],
      [null, "not_an_object"],
      [["monthly_reminder"], "not_an_object"],
      [Object.create({ event_format: 1, tasks: ["monthly_reminder"] }), "not_an_object"],
      [{ event_format: 1, tasks: ["monthly_reminder"], at: "x" }, "unknown_key"],
      [JSON.parse('{"event_format":1,"tasks":["monthly_reminder"],"__proto__":{}}'), "unknown_key"],
      [{ tasks: ["monthly_reminder"] }, "missing_key"],
      [{ event_format: 1 }, "missing_key"],
      [{ event_format: 2, tasks: ["monthly_reminder"] }, "format"],
      [{ event_format: "1", tasks: ["monthly_reminder"] }, "format"],
      [{ event_format: 1, tasks: "monthly_reminder" }, "not_a_list"],
      [{ event_format: 1, tasks: [] }, "empty"],
      [{ event_format: 1, tasks: ["toString"] }, "unknown_task"],
      [{ event_format: 1, tasks: ["prices_update"] }, "task_not_in_function"],
      [{ event_format: 1, tasks: ["monthly_reminder", "monthly_reminder"] }, "repeated_task"],
    ];
    for (const [event, reason] of cases) {
      expect(parseJobEvent(event, MAIL), reason).toEqual({
        ok: false,
        code: "job_event_invalid",
        reason,
      });
    }
  });
});

const MAIL_ENV = {
  ATLAS_ENV: "prod",
  ATLAS_DATA_BUCKET: "atlas-prod-data-x1",
  ATLAS_JOBS: "dispatch_findings,monthly_reminder",
  ATLAS_MAIL_FROM: "atlas@example.test",
  ATLAS_ORIGIN: "https://atlas.example.test",
  ATLAS_OAUTH_IDLE_WARNING_DAYS: "150",
  ATLAS_JOB_MAX_RUN_SECONDS: "900",
};

const reasonOf = (env: Record<string, string | undefined>): unknown => {
  try {
    parseJobsConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    const failure = error as ValidationError;
    expect(failure.code).toBe("jobs_config_invalid");
    return failure.details;
  }
  return "accepted";
};

describe("the configuration of a function (R17)", () => {
  it("reads the mail function", () => {
    expect(parseJobsConfig(MAIL_ENV)).toEqual({
      env: "prod",
      ssmPrefix: "/atlas/prod/",
      dataBucket: "atlas-prod-data-x1",
      family: "mail",
      jobs: ["dispatch_findings", "monthly_reminder"],
      maxRunMs: 900_000,
      mail: {
        from: "atlas@example.test",
        origin: "https://atlas.example.test",
        idleWarningDays: 150,
      },
    });
  });

  it("reads a function of another family without the variables of the mail", () => {
    expect(
      parseJobsConfig({
        ATLAS_ENV: "dev",
        ATLAS_DATA_BUCKET: "atlas-dev-data-x1",
        ATLAS_JOBS: "ecb_update",
        ATLAS_JOB_MAX_RUN_SECONDS: "300",
      }),
    ).toEqual({
      env: "dev",
      ssmPrefix: "/atlas/dev/",
      dataBucket: "atlas-dev-data-x1",
      family: "ecb",
      jobs: ["ecb_update"],
      maxRunMs: 300_000,
    });
  });

  it("refuses to start with anything it does not understand, saying which and why", () => {
    const cases: [Record<string, string | undefined>, unknown][] = [
      [
        { ...MAIL_ENV, ATLAS_JOBS: undefined },
        { variable: "ATLAS_JOBS", reason: "missing" },
      ],
      [
        { ...MAIL_ENV, ATLAS_JOBS: "" },
        { variable: "ATLAS_JOBS", reason: "missing" },
      ],
      [
        { ...MAIL_ENV, ATLAS_JOBS: "monthly_reminder,nothing" },
        { variable: "ATLAS_JOBS", reason: "unknown_task" },
      ],
      [
        { ...MAIL_ENV, ATLAS_JOBS: "monthly_reminder,monthly_reminder" },
        { variable: "ATLAS_JOBS", reason: "repeated_task" },
      ],
      [
        { ...MAIL_ENV, ATLAS_JOBS: "monthly_reminder,prices_update" },
        { variable: "ATLAS_JOBS", reason: "mixed_families" },
      ],
      [
        { ...MAIL_ENV, ATLAS_EODHD_KEY: "k" },
        { variable: "ATLAS_EODHD_KEY", reason: "unknown" },
      ],
      [
        {
          ATLAS_ENV: "dev",
          ATLAS_DATA_BUCKET: "atlas-dev-data-x1",
          ATLAS_JOBS: "ecb_update",
          ATLAS_MAIL_FROM: "a@b.c",
        },
        { variable: "ATLAS_MAIL_FROM", reason: "other_family" },
      ],
      [
        { ...MAIL_ENV, ATLAS_ENV: "staging" },
        { variable: "ATLAS_ENV", reason: "not_dev_or_prod" },
      ],
      [
        { ...MAIL_ENV, ATLAS_ENV: undefined },
        { variable: "ATLAS_ENV", reason: "missing" },
      ],
      [
        { ...MAIL_ENV, ATLAS_DATA_BUCKET: "Bucket" },
        { variable: "ATLAS_DATA_BUCKET", reason: "not_a_bucket_name" },
      ],
      [
        { ...MAIL_ENV, ATLAS_MAIL_FROM: "Atlas <atlas@example.test>" },
        { variable: "ATLAS_MAIL_FROM", reason: "not_a_mail_address" },
      ],
      [
        { ...MAIL_ENV, ATLAS_ORIGIN: "http://atlas.example.test" },
        { variable: "ATLAS_ORIGIN", reason: "not_an_https_origin" },
      ],
      [
        { ...MAIL_ENV, ATLAS_OAUTH_IDLE_WARNING_DAYS: "0" },
        { variable: "ATLAS_OAUTH_IDLE_WARNING_DAYS", reason: "not_a_positive_integer" },
      ],
      [
        { ...MAIL_ENV, ATLAS_OAUTH_IDLE_WARNING_DAYS: "180" },
        { variable: "ATLAS_OAUTH_IDLE_WARNING_DAYS", reason: "above_ceiling" },
      ],
    ];
    for (const [env, details] of cases) {
      expect(reasonOf(env)).toEqual(details);
    }
    expect(reasonOf({ ...MAIL_ENV, ATLAS_OAUTH_IDLE_WARNING_DAYS: "179" })).toBe("accepted");
    // The longest a run lasts: the timeout of the Lambda, at most 900 s (N3).
    expect(reasonOf({ ...MAIL_ENV, ATLAS_JOB_MAX_RUN_SECONDS: undefined })).toEqual({
      variable: "ATLAS_JOB_MAX_RUN_SECONDS",
      reason: "missing",
    });
    expect(reasonOf({ ...MAIL_ENV, ATLAS_JOB_MAX_RUN_SECONDS: "901" })).toEqual({
      variable: "ATLAS_JOB_MAX_RUN_SECONDS",
      reason: "above_ceiling",
    });
    expect(reasonOf({ ...MAIL_ENV, ATLAS_JOB_MAX_RUN_SECONDS: "0" })).toEqual({
      variable: "ATLAS_JOB_MAX_RUN_SECONDS",
      reason: "not_a_positive_integer",
    });
  });
});

describe("a mail address (R6)", () => {
  it("is one plain address, with nothing a header could be split on", () => {
    for (const good of ["user@example.test", "a.b+c@sub.example.test", `${"a".repeat(64)}@x.io`]) {
      expect(isMailAddress(good), good).toBe(true);
    }
    for (const bad of [
      "",
      "user",
      "@example.test",
      "user@",
      "user@example",
      "a@b@example.test",
      "user@example.test,other@example.test",
      "User <user@example.test>",
      "user @example.test",
      "user@example.test\nBcc: x@y.z",
      ".user@example.test",
      "us..er@example.test",
      "user@-example.test",
      "usér@example.test",
      `${"a".repeat(65)}@x.io`,
      `a@${"b".repeat(250)}.io`,
      7,
    ]) {
      expect(isMailAddress(bad), String(bad)).toBe(false);
    }
  });
});

describe("the switch of the amounts (R4)", () => {
  it("is on only with `on`: absent or anything else leaves it off", () => {
    expect(amountsSwitch("on")).toBe("on");
    for (const value of [undefined, "", "off", "ON", "On", " on", "on ", "true", "1", "yes"]) {
      expect(amountsSwitch(value), String(value)).toBe("off");
    }
  });
});
