// `GET /api/jobs/status` (`docs/api.md` §6.3) over the double of S3, with the session of the web.

import { describe, expect, it } from "vitest";
import { CONFIG, errorOf, SELF, setup } from "./harness.js";

type Api = ReturnType<typeof setup>;

const record = (task: string, period: string, closed_at: string, extra = {}) =>
  `${JSON.stringify({
    run_format: 1,
    task,
    period,
    state: "done",
    claimed_at: closed_at,
    attempts: 1,
    closed_at,
    outcome: { code: "task_done", counts: { assets: 7 } },
    ...extra,
  })}\n`;

const get = (api: Api) => api.call("GET", "/api/jobs/status", { headers: { origin: SELF } });
const tasksOf = async (api: Api) => {
  const answer = await get(api);
  expect(answer.statusCode).toBe(200);
  return (JSON.parse(answer.body) as { tasks: { task: string }[] }).tasks;
};
const taskOf = async (api: Api, task: string) =>
  (await tasksOf(api)).find((entry) => entry.task === task);

describe("the last run of each task (§6.3)", () => {
  it("needs a session", async () => {
    const answer = await get(setup());
    expect(answer.statusCode).toBe(401);
    expect(errorOf(answer).code).toBeDefined();
  });

  it("says every task, with nothing but its name when it has no record", async () => {
    const api = setup();
    await api.signIn();
    const tasks = await tasksOf(api);
    expect(tasks).toHaveLength(9);
    expect(tasks[0]).toEqual({ task: "ecb_update", schedule: "ecb" });
    expect(JSON.parse((await get(api)).body)).not.toHaveProperty("since");
  });

  it("says only the families scheduled in this environment, also for since", async () => {
    const api = setup({ config: { ...CONFIG, activeJobFamilies: ["mail"] } });
    await api.signIn();
    api.s3.seed(
      "jobs/ecb/ecb_update/2025-01-01.json",
      record("ecb_update", "2025-01-01", "2025-01-01T16:15:00Z"),
    );
    api.s3.seed(
      "jobs/mail/monthly_reminder/2026-10.json",
      record("monthly_reminder", "2026-10", "2026-10-01T06:00:00Z"),
    );
    const body = JSON.parse((await get(api)).body) as { since: string; tasks: { task: string }[] };
    expect(body.tasks.map((entry) => entry.task)).toEqual([
      "dispatch_findings",
      "monthly_reminder",
      "weekly_review",
      "tax_return_ready",
      "informative_thresholds",
    ]);
    expect(body.since).toBe("2026-10-01T06:00:00Z");
  });

  it("says no task at all in a sleeping environment", async () => {
    const api = setup({ config: { ...CONFIG, activeJobFamilies: [] } });
    await api.signIn();
    expect(JSON.parse((await get(api)).body)).toEqual({ tasks: [] });
  });

  it("says since from the first record of any task, not from its last run", async () => {
    const api = setup();
    await api.signIn();
    for (const [period, at] of [
      ["2026-01-05", "2026-01-05T16:15:00Z"],
      ["2026-06-10", "2026-06-10T16:15:00Z"],
      ["2026-10-31", "2026-10-31T16:15:00Z"],
    ] as const) {
      api.s3.seed(`jobs/ecb/ecb_update/${period}.json`, record("ecb_update", period, at));
    }
    const reads = api.s3.calls.length;
    const body = JSON.parse((await get(api)).body) as { since: string };
    expect(body.since).toBe("2026-01-05T16:15:00Z");
    // The first and the last record of the task, never the ones in between.
    const after = api.s3.calls.slice(reads).map(String).join(" ");
    expect(after).not.toContain("2026-06-10");
  });

  it("says the last run and nothing of its outcome, its counts or its findings", async () => {
    const api = setup();
    await api.signIn();
    api.s3.seed(
      "jobs/ecb/ecb_update/2026-10-30.json",
      record("ecb_update", "2026-10-30", "2026-10-30T16:15:00Z"),
    );
    api.s3.seed(
      "jobs/ecb/ecb_update/2026-10-31.json",
      record("ecb_update", "2026-10-31", "2026-10-31T16:15:00Z", {
        findings: [{ code: "ecb_calendar_mismatch", subject: "ecb", counts: { days: 2 } }],
      }),
    );
    expect(await taskOf(api, "ecb_update")).toEqual({
      task: "ecb_update",
      schedule: "ecb",
      period: "2026-10-31",
      state: "done",
      at: "2026-10-31T16:15:00Z",
    });
    const body = (await get(api)).body;
    for (const word of ['"findings"', '"outcome"', '"counts"', "mismatch"]) {
      expect(body).not.toContain(word);
    }
  });

  it("takes the newest run across a change of frequency, whatever the names sort to", async () => {
    const api = setup();
    await api.signIn();
    api.s3.seed(
      "jobs/ecb/ecb_update/2026-W40.json",
      record("ecb_update", "2026-W40", "2026-10-01T16:15:00Z"),
    );
    api.s3.seed(
      "jobs/ecb/ecb_update/2026-10-31.json",
      record("ecb_update", "2026-10-31", "2026-10-31T16:15:00Z"),
    );
    expect(await taskOf(api, "ecb_update")).toMatchObject({ period: "2026-10-31" });
  });

  it("says a record that does not read, and never its text", async () => {
    const api = setup();
    await api.signIn();
    api.s3.seed("jobs/ecb/ecb_update/2026-10-31.json", "ES0000000001 not json");
    api.s3.seedBytes("jobs/mail/monthly_reminder/2026-10.json", new Uint8Array([0xff, 0xfe]));
    expect(await taskOf(api, "ecb_update")).toEqual({
      task: "ecb_update",
      schedule: "ecb",
      unreadable: true,
    });
    expect(await taskOf(api, "monthly_reminder")).toEqual({
      task: "monthly_reminder",
      schedule: "reminder",
      unreadable: true,
    });
  });

  it("prefers a run that reads to one that does not", async () => {
    const api = setup();
    await api.signIn();
    api.s3.seed("jobs/ecb/ecb_update/2026-W44.json", "broken");
    api.s3.seed(
      "jobs/ecb/ecb_update/2026-10-30.json",
      record("ecb_update", "2026-10-30", "2026-10-30T16:15:00Z"),
    );
    expect(await taskOf(api, "ecb_update")).toMatchObject({ state: "done" });
  });

  it("ignores what is not a record of the task", async () => {
    const api = setup();
    await api.signIn();
    api.s3.seed("jobs/ecb/ecb_update/notes.txt", "free text");
    expect(await taskOf(api, "ecb_update")).toEqual({ task: "ecb_update", schedule: "ecb" });
  });
});
