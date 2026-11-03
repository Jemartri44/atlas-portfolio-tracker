// @vitest-environment happy-dom
//
// A task that stops running sends no mail, so the web says it: the card of Ajustes, and a warning
// of *Atención* when one is late or the status cannot be read, which takes nothing else with it.

import { afterEach, describe, expect, it } from "vitest";
import { today } from "../src/ledger/state.js";
import { JobsCard } from "../src/routes/ajustes/JobsCard.jsx";
import Resumen from "../src/routes/resumen/index.jsx";
import { lateJobsNotice } from "../src/view-models/late-jobs.js";
import { show, text, until, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});

const answer = (body: unknown, status = 200): void => {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
};

const daysAgo = (days: number): string =>
  new Date(Date.parse(`${today()}T12:00:00Z`) - days * 86_400_000).toISOString();

const fresh = {
  since: daysAgo(400),
  tasks: [
    { task: "ecb_update", schedule: "ecb", period: "2026-10-31", state: "done", at: daysAgo(1) },
  ],
};
const late = {
  since: daysAgo(400),
  tasks: [
    { task: "ecb_update", schedule: "ecb", period: "2026-10-01", state: "failed", at: daysAgo(30) },
    { task: "monthly_reminder", schedule: "reminder" },
    { task: "weekly_review", schedule: "review", unreadable: true },
  ],
};

describe("the warning of tasks that stopped running", () => {
  const rows = (lateCount: number) => ({
    kind: "ready" as const,
    rows: Array.from({ length: 3 }, (_, index) => ({
      task: "ecb_update" as const,
      frequency: "daily" as const,
      unreadable: false,
      late: index < lateCount,
    })),
  });

  it("says how many, and where to see them", () => {
    expect(lateJobsNotice(rows(1))).toMatchObject({
      severity: "caution",
      message: expect.stringContaining("Una tarea automática lleva"),
      action: { to: "/ajustes#tareas" },
    });
    expect(lateJobsNotice(rows(2))?.message).toContain("2 tareas automáticas llevan");
  });

  it("says it could not check them when the status failed", () => {
    expect(lateJobsNotice({ kind: "failed" })).toMatchObject({
      severity: "caution",
      message: expect.stringContaining("No se ha podido comprobar"),
      action: { to: "/ajustes#tareas" },
    });
  });

  it("says nothing when none is late or it has not answered", () => {
    expect(lateJobsNotice(rows(0))).toBeUndefined();
    expect(lateJobsNotice(undefined)).toBeUndefined();
  });
});

describe("«Tareas automáticas» in Ajustes", () => {
  it("says when each task ran, how it ended and which are late", async () => {
    answer(late);
    const host = await show("/ajustes", JobsCard);
    await until(() => text(host).includes("Histórico del BCE"));
    const shown = text(host);
    expect(shown).toContain("falló");
    expect(shown).toContain("Con retraso");
    expect(shown).toContain("Recordatorio mensual");
    expect(shown).toContain("sin ejecuciones");
    expect(shown).toContain("registro ilegible");
  });

  it("says a sleeping environment has no tasks, without a warning", async () => {
    answer({ tasks: [] });
    const host = await show("/ajustes", JobsCard);
    await until(() => text(host).includes("no tiene tareas activas"));
    expect(text(host)).not.toContain("Con retraso");
  });

  it.each([
    ["an error", () => answer({ error: { code: "x" } }, 500)],
    ["a shape it does not know", () => answer({ tasks: "x" })],
    ["no answer", () => undefined],
  ])("says it could not read them on %s", async (_name, arrange) => {
    arrange();
    const host = await show("/ajustes", JobsCard);
    await until(() => text(host).includes("No se ha podido leer"));
  });
});

describe("the summary", () => {
  it("warns in *Atención* when a task is late", async () => {
    answer(late);
    const host = await show("/", Resumen);
    await until(() => text(host).includes("tareas automáticas llevan"));
  });

  it("stays as it was with every task on time", async () => {
    answer(fresh);
    const onTime = await show("/", Resumen);
    await until(() => text(onTime).includes("Atención"));
    expect(text(onTime)).not.toContain("tareas automáticas");
  });

  it("warns that it could not check them with a status it cannot read", async () => {
    answer({}, 500);
    const failed = await show("/", Resumen);
    await until(() => text(failed).includes("No se ha podido comprobar"));
    expect(text(failed)).toContain("Atención");
  });
});
