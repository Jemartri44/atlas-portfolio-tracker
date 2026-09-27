// Feature 016, E1 (R9, §8.1 P5): `job_frequencies`, read tolerantly and
// written strictly, with the monthly reminder that cannot be switched off.

import { describe, expect, it } from "vitest";
import { frequencyOf, JOB_TASKS, type JobTask } from "../../src/jobs/catalog.js";
import { readJobFrequencies, validJobFrequencies } from "../../src/settings/job-frequencies.js";

const DEFAULTS = {
  ecb: "daily",
  prices: "daily",
  reminder: "monthly",
  backup: "monthly",
  integrity: "quarterly",
  review: "weekly",
  tax_return: "yearly",
  informative_thresholds: "yearly",
};

describe("job_frequencies, read tolerantly (R9)", () => {
  it("uses the defaults when the settings say nothing", () => {
    expect(readJobFrequencies(undefined)).toEqual({ frequencies: DEFAULTS, ignored: [] });
  });

  it("reads the golden of the synthetic generator: reconciliation is said, never invalid", () => {
    const read = readJobFrequencies({
      prices: "daily",
      reminder: "monthly",
      reconciliation: "quarterly",
    });
    expect(read.frequencies).toEqual(DEFAULTS);
    expect(read.ignored).toEqual([{ code: "job_not_available", key: "reconciliation" }]);
  });

  it("takes an admitted value and says each key or value it ignores, with its own code", () => {
    const read = readJobFrequencies({
      prices: "weekly",
      integrity: "monthly",
      review: "monthly",
      ecb: "hourly",
      reminder: "off",
      mystery: "daily",
      "Not A Key!": "daily",
    });
    expect(read.frequencies).toEqual({
      ...DEFAULTS,
      prices: "weekly",
      integrity: "monthly",
      review: "monthly",
    });
    expect(read.ignored).toEqual([
      { code: "job_frequency_unknown_key" },
      { code: "job_frequency_invalid_value", key: "ecb" },
      { code: "job_frequency_unknown_key", key: "mystery" },
      { code: "job_frequency_invalid_value", key: "reminder" },
    ]);
  });

  it("keeps the monthly reminder monthly whatever the settings say (constitution V)", () => {
    for (const value of ["off", "never", "yearly", "", null, 0]) {
      expect(readJobFrequencies({ reminder: value }).frequencies.reminder).toBe("monthly");
    }
    expect(
      frequencyOf("monthly_reminder", readJobFrequencies({ reminder: "off" }).frequencies),
    ).toBe("monthly");
  });

  it("ignores a map that is not one, and never finds a key through the prototype", () => {
    for (const raw of ["daily", ["daily"], null, 7, Object.create({ ecb: "weekly" })]) {
      expect(readJobFrequencies(raw)).toEqual({
        frequencies: DEFAULTS,
        ignored: [{ code: "job_frequencies_invalid" }],
      });
    }
    const read = readJobFrequencies(JSON.parse('{"__proto__":"daily","toString":"daily"}'));
    expect(read.frequencies).toEqual(DEFAULTS);
    expect(read.ignored.map((entry) => entry.code)).toEqual([
      "job_frequency_unknown_key",
      "job_frequency_unknown_key",
    ]);
  });
});

describe("job_frequencies, written strictly", () => {
  it("accepts only known keys with admitted values", () => {
    expect(validJobFrequencies({})).toBe(true);
    expect(validJobFrequencies({ prices: "weekly", integrity: "monthly" })).toBe(true);
    expect(validJobFrequencies({ reconciliation: "quarterly" })).toBe(false);
    expect(validJobFrequencies({ reminder: "off" })).toBe(false);
    expect(validJobFrequencies({ prices: "hourly" })).toBe(false);
    expect(validJobFrequencies("daily")).toBe(false);
    expect(validJobFrequencies(null)).toBe(false);
  });
});

describe("the catalog of the jobs", () => {
  it("gives each job its frequency: a key of the settings or a fixed one", () => {
    const frequencies = readJobFrequencies({ prices: "weekly" }).frequencies;
    const expected: Record<JobTask, string> = {
      ecb_update: "daily",
      prices_update: "weekly",
      dispatch_findings: "daily",
      monthly_reminder: "monthly",
      weekly_review: "weekly",
      tax_return_ready: "yearly",
      informative_thresholds: "yearly",
      monthly_backup: "monthly",
      quarterly_integrity: "quarterly",
    };
    for (const task of Object.keys(JOB_TASKS) as JobTask[]) {
      expect(frequencyOf(task, frequencies), task).toBe(expected[task]);
    }
  });

  it("puts every mail in the mail family, and only there (§8.2 B2)", () => {
    const mail = (Object.keys(JOB_TASKS) as JobTask[]).filter(
      (task) => JOB_TASKS[task].family === "mail",
    );
    expect(mail).toEqual([
      "dispatch_findings",
      "monthly_reminder",
      "weekly_review",
      "tax_return_ready",
      "informative_thresholds",
    ]);
    expect(JOB_TASKS.monthly_reminder.delivery).toBe("at_least_once");
    for (const task of ["weekly_review", "tax_return_ready", "informative_thresholds"] as const) {
      expect(JOB_TASKS[task].delivery).toBe("at_most_once");
    }
  });
});
