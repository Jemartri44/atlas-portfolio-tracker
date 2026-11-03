// @vitest-environment happy-dom
//
// A `412` replaces the ledger a form was opened on. What the form asks of the rate rules after
// it (the proposal, the rates to confirm) must be asked of the ledger that is there now.

import type { LedgerState } from "@atlas/domain";
import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

const seen: LedgerState[] = [];
vi.mock("../src/ecb/history.js", () => ({
  loadWebHistory: async () => ({ history: {}, staleDays: 30 }),
}));
vi.mock("../src/view-models/forms/rates.js", () => ({
  proposedValues: (_spec: unknown, values: unknown, state: LedgerState) => {
    seen.push(state);
    return { values, hint: { kind: "none" } };
  },
  ratesToConfirm: (_spec: unknown, _values: unknown, state: LedgerState) => {
    seen.push(state);
    return [];
  },
}));

const { useFormRates } = await import("../src/routes/registrar/rates.js");

describe("the rates of a form after the ledger moved under it", () => {
  it("proposes and checks against the ledger held now, not the one it opened on", async () => {
    const opened = { id: "opened" } as unknown as LedgerState;
    const arrived = { id: "arrived" } as unknown as LedgerState;
    const held = { state: opened };
    await createRoot(async (dispose) => {
      const [values] = createSignal({});
      const [typed] = createSignal<ReadonlySet<string>>(new Set());
      const rates = useFormRates({
        spec: { fields: [] } as never,
        state: () => held.state,
        values,
        setValues: () => undefined,
        typed,
        correcting: false,
      });
      await vi.waitFor(() => expect(rates.web()).toBeDefined());
      held.state = arrived;
      rates.check({});
      expect(seen.at(-1)).toBe(arrived);
      dispose();
    });
  });
});
