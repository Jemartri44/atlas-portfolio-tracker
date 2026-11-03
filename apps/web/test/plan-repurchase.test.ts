// @vitest-environment happy-dom
//
// The repurchase calendar runs the fiscal engine: a change of the plan filters
// what was read, and only another ledger or date reads it again.

import type { LedgerEvent } from "@atlas/domain";
import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { usePlanRepurchase } from "../src/routes/cartera/plan-repurchase.jsx";
import type { ContributionView } from "../src/view-models/core/index.js";

const reads = vi.hoisted(() => ({ dates: [] as string[] }));

vi.mock("@atlas/domain/fiscal", () => ({
  repurchaseCalendar: (_events: unknown, date: string) => {
    reads.dates.push(date);
    return {};
  },
  planRepurchaseWarnings: () => [],
}));

const plan = (): ContributionView => ({ rows: [] }) as unknown as ContributionView;
const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("usePlanRepurchase", () => {
  it("reads the calendar once per ledger and date, however often the plan changes", async () => {
    const events: LedgerEvent[] = [];
    const [view, setView] = createSignal(plan());
    const [date, setDate] = createSignal("2029-01-20");
    const dispose = createRoot((dispose) => {
      usePlanRepurchase(() => ({ events, view: view(), date: date() }));
      return dispose;
    });
    await flush();
    setView(plan());
    setView(plan());
    await flush();
    expect(reads.dates).toEqual(["2029-01-20"]);
    setDate("2029-01-21");
    await flush();
    expect(reads.dates).toEqual(["2029-01-20", "2029-01-21"]);
    dispose();
  });
});
