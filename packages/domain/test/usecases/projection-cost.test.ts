// How many times a mutation projects the ledger. The ledger is loaded whole and
// projected from scratch (ADR-0002), so this is the cost of every write: `plan.md`
// declares one projection, and two only for a `settings_changed` that leaves
// recorded events invalid (ADR-0015).

import { describe, expect, it, vi } from "vitest";

const counter = vi.hoisted(() => ({ calls: 0 }));

vi.mock("../../src/projections/project-ledger.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/projections/project-ledger.js")>();
  return {
    ...actual,
    projectLedger: (...args: Parameters<typeof actual.projectLedger>) => {
      counter.calls += 1;
      return actual.projectLedger(...args);
    },
  };
});

const { DEFAULT_SETTINGS, mergeSettings } = await import("../../src/settings/settings.js");
const { recordEvent } = await import("../../src/usecases/record-event.js");
const { reverseEvent } = await import("../../src/usecases/rectify.js");
const { catalogue, LedgerBuilder } = await import("../ledger-builder.js");
const { TestStore } = await import("../memory-store.js");
const { testDeps } = await import("./helpers.js");

const seeded = () => {
  const b = new LedgerBuilder();
  catalogue(b);
  return new TestStore(b.build());
};

const buyDraft = {
  type: "buy" as const,
  account_id: "acc_fund",
  asset_id: "ast_world",
  trade_date: "2027-01-11",
  value_date: "2027-01-12",
  quantity: "10",
  unit_price: "100",
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-01-12",
  fee: "0",
  source: "manual",
};

/** Runs the mutation and returns how many projections it took. */
const cost = async (run: () => Promise<unknown>): Promise<number> => {
  counter.calls = 0;
  await run();
  return counter.calls;
};

describe("the projection cost of a mutation", () => {
  it("projects once to record an event", async () => {
    const deps = testDeps(seeded());
    expect(await cost(() => recordEvent(deps, buyDraft))).toBe(1);
  });

  it("projects once for a settings change that breaks nothing", async () => {
    const deps = testDeps(seeded());
    expect(
      await cost(() =>
        recordEvent(deps, {
          type: "settings_changed",
          settings: mergeSettings(DEFAULT_SETTINGS, { stale_price_days: 9 }),
        }),
      ),
    ).toBe(1);
  });

  it("projects twice for a settings change that reinterprets the past", async () => {
    const store = seeded();
    const deps = testDeps(store);
    // The buy settles after the sale was agreed: read by trade date, the sale comes first.
    await recordEvent(deps, { ...buyDraft, trade_date: "2027-01-13", value_date: "2027-01-15" });
    await recordEvent(deps, {
      ...buyDraft,
      type: "sell",
      trade_date: "2027-01-12",
      value_date: "2027-01-20",
    });
    const byTradeDate = mergeSettings(DEFAULT_SETTINGS, {
      fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, fund: "trade_date" },
    });
    expect(
      await cost(() =>
        recordEvent(
          deps,
          { type: "settings_changed", settings: byTradeDate },
          {
            acceptInvalid: true,
            syncConfigured: false,
          },
        ),
      ),
    ).toBe(2);
  });

  it("projects once to reverse an event", async () => {
    const store = seeded();
    const deps = testDeps(store);
    const buy = await recordEvent(deps, buyDraft);
    expect(await cost(() => reverseEvent(deps, buy.event.id, "test"))).toBe(1);
  });
});
