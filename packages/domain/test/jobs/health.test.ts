// Which tasks are late: the threshold comes from the frequency, and a task that never ran is late
// once Atlas has been running for longer than it may wait.

import { describe, expect, it } from "vitest";
import { JOB_TASKS, type JobTask } from "../../src/jobs/catalog.js";
import { lastRunOf, runPeriods } from "../../src/jobs/health.js";
import type { RunRecord } from "../../src/jobs/run-record.js";
import { readJobFrequencies } from "../../src/settings/job-frequencies.js";
import {
  allowedDays,
  type JobLastRun,
  jobHealth,
  parseJobStatus,
} from "../../src/settings/job-health.js";

const { frequencies } = readJobFrequencies(undefined);
const entry = (task: JobTask) => ({ task, schedule: JOB_TASKS[task].frequency });
const ran = (task: JobTask, at: string): JobLastRun => ({
  ...entry(task),
  period: "2026-10",
  state: "done",
  at,
});

describe("how long a task may go without running", () => {
  it.each([
    ["daily", 3],
    ["weekly", 9],
    ["monthly", 33],
    ["quarterly", 94],
    ["yearly", 368],
  ] as const)("%s: %i days", (frequency, days) => {
    expect(allowedDays(frequency)).toBe(days);
  });
});

describe("the health of the tasks", () => {
  const SINCE = "2026-01-05T07:00:00Z";
  const health = (tasks: readonly JobLastRun[], today: string, since: string | undefined = SINCE) =>
    jobHealth({ ...(since === undefined ? {} : { since }), tasks }, frequencies, today);

  it("says a task late the day after its allowance, and not on the day", () => {
    const runs = [ran("ecb_update", "2026-10-29T16:15:00Z")];
    expect(health(runs, "2026-11-01")[0]).toMatchObject({ days: 3, late: false });
    expect(health(runs, "2026-11-02")[0]).toMatchObject({ days: 4, late: true });
  });

  it("follows the frequency in the settings", () => {
    const weekly = { ...frequencies, ecb: "weekly" } as const;
    const tasks = [ran("ecb_update", "2026-10-29T16:15:00Z")];
    expect(jobHealth({ since: SINCE, tasks }, weekly, "2026-11-02")[0]?.late).toBe(false);
  });

  it("reads the day of a run in Madrid, not in UTC", () => {
    expect(health([ran("ecb_update", "2026-10-31T23:30:00Z")], "2026-11-01")[0]).toMatchObject({
      last: { day: "2026-11-01" },
      days: 0,
    });
  });

  it("says late a monthly task that never started, however fresh the daily ones are", () => {
    const rows = health(
      [ran("ecb_update", "2026-11-19T16:15:00Z"), entry("monthly_reminder")],
      "2026-11-20",
    );
    expect(rows[1]).toMatchObject({ task: "monthly_reminder", late: true });
    expect(rows[1]).not.toHaveProperty("last");
  });

  it("gives a task with no record its allowance from the day Atlas started", () => {
    const tasks = [entry("monthly_reminder")] as const;
    expect(health(tasks, "2026-02-07")[0]?.late).toBe(false);
    expect(health(tasks, "2026-02-08")[0]?.late).toBe(true);
    expect(health([entry("tax_return_ready")], "2026-11-20")[0]?.late).toBe(false);
  });

  it("says every active task late when nothing has ever run", () => {
    const rows = jobHealth({ tasks: [entry("ecb_update")] }, frequencies, "2026-11-01");
    expect(rows[0]?.late).toBe(true);
  });

  it("says nothing with no active task, as a sleeping environment", () => {
    expect(jobHealth({ tasks: [] }, frequencies, "2026-11-01")).toEqual([]);
  });

  it("says a record that does not read as such, and measures as with no record", () => {
    expect(health([{ ...entry("ecb_update"), unreadable: true }], "2026-01-06")[0]).toMatchObject({
      unreadable: true,
      late: false,
    });
  });

  it("never counts a reserved key: it is no task of the catalogue", () => {
    const { frequencies: reserved } = readJobFrequencies({ reconciliation: "weekly" });
    expect(Object.keys(JOB_TASKS)).not.toContain("reconciliation");
    expect(Object.keys(reserved)).not.toContain("reconciliation");
  });
});

describe("what the API reads of a record", () => {
  const record: RunRecord = {
    run_format: 1,
    task: "monthly_backup",
    period: "2026-10",
    state: "done",
    claimed_at: "2026-10-01T01:15:00Z",
    closed_at: "2026-10-01T01:16:00Z",
    attempts: 1,
    outcome: { code: "backup_done", counts: { objects: 12 } },
    findings: [{ code: "backup_ecb_missing", subject: "backup" }],
  };

  it("takes the task, the period, the state and when it closed, and nothing else", () => {
    expect(lastRunOf(record)).toEqual({
      task: "monthly_backup",
      schedule: "backup",
      period: "2026-10",
      state: "done",
      at: "2026-10-01T01:16:00Z",
    });
  });

  it("takes when it was claimed while it is open", () => {
    const { closed_at: _closed, ...open } = record;
    expect(lastRunOf({ ...open, state: "claimed" })).toMatchObject({
      at: "2026-10-01T01:15:00Z",
    });
  });

  it("keeps the latest and earliest period of each kind, and ignores what is not a record", () => {
    expect(
      runPeriods([
        "jobs/ecb/ecb_update/2026-10-30.json",
        "jobs/ecb/ecb_update/2026-10-31.json",
        "jobs/ecb/ecb_update/2026-W40.json",
        "jobs/ecb/ecb_update/2026-W44.json",
        "jobs/ecb/ecb_update/notes.txt",
        "jobs/ecb/ecb_update/not-a-period.json",
      ]),
    ).toEqual({ latest: ["2026-10-31", "2026-W44"], earliest: ["2026-10-30", "2026-W40"] });
    expect(runPeriods([])).toEqual({ latest: [], earliest: [] });
  });
});

describe("the answer of the API, as the web reads it", () => {
  const RUN = {
    task: "ecb_update",
    schedule: "ecb",
    period: "2026-10-31",
    state: "done",
    at: "2026-10-31T16:15:00Z",
  };

  it("takes the three kinds of entry, with since or without it", () => {
    const answer = {
      since: "2026-01-05T07:00:00Z",
      tasks: [
        RUN,
        { task: "dispatch_findings", schedule: { fixed: "daily" } },
        { task: "weekly_review", schedule: "review", unreadable: true },
      ],
    };
    expect(parseJobStatus(answer)).toEqual(answer);
    expect(parseJobStatus({ tasks: [] })).toEqual({ tasks: [] });
  });

  it.each([
    ["nothing", undefined],
    ["no tasks", {}],
    ["tasks that are no list", { tasks: "x" }],
    ["an extra key", { tasks: [], extra: 1 }],
    ["a since that is no instant", { tasks: [], since: "ayer" }],
    ["a task with a name it cannot be", { tasks: [{ ...RUN, task: "Not A Task" }] }],
    ["a schedule it does not know", { tasks: [{ ...RUN, schedule: "reconciliation" }] }],
    ["a fixed frequency it does not know", { tasks: [{ ...RUN, schedule: { fixed: "hourly" } }] }],
    ["an entry that is no object", { tasks: [1] }],
    ["a state out of shape", { tasks: [{ ...RUN, state: "No State" }] }],
    ["a period out of shape", { tasks: [{ ...RUN, period: "ayer" }] }],
    ["an instant out of shape", { tasks: [{ ...RUN, at: "ayer" }] }],
    [
      "a flag that is not true",
      { tasks: [{ task: "ecb_update", schedule: "ecb", unreadable: false }] },
    ],
    ["an entry with more than it may say", { tasks: [{ ...RUN, outcome: "x" }] }],
  ])("refuses %s", (_name, answer) => {
    expect(parseJobStatus(answer)).toBeUndefined();
  });
});
