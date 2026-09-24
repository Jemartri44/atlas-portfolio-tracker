// A correction is the same economic fact: its lot keeps the place of the
// original (decision of the direction on the adversarial review of PR #75,
// feature 012). The FIFO tie-break between lots of the same date is the file
// position — **of the root of the correction chain**, not of the correction,
// which is appended at the end of the file.

import { describe, expect, it } from "vitest";
import { readEcbZipCsv } from "../../src/ecb/history.js";
import { prepareRateCorrections, writeRateCorrections } from "../../src/ecb/rule-change.js";
import { fiscalLots } from "../../src/projections/lots.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { Draft, LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { correctEvent } from "../../src/usecases/rectify.js";
import { ecbFixture } from "../fixtures-path.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { testDeps } from "../usecases/helpers.js";

const history = readEcbZipCsv(ecbFixture("eurofxref-hist.csv"));

/**
 * The reviewer's case: two purchases of the same day, 2 at 100 USD and 2 at
 * 200 USD, and a sale of 2 — which consumes the first, the cheap one.
 */
const ledger = (changedRule = false) => {
  const b = new LedgerBuilder();
  catalogue(b);
  const cheap = b.buy({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    trade_date: "2026-01-02",
    value_date: "2026-01-06",
    quantity: "2",
    unit_price: "100",
    currency: "USD",
    fx_rate: "1.1169",
    fx_rate_date: "2026-01-02",
  });
  // After the change of rule, only the cheap purchase is left with a rate of
  // another day: the dear one already carries the one of its value date.
  const dear = b.buy({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    trade_date: "2026-01-02",
    value_date: "2026-01-06",
    quantity: "2",
    unit_price: "200",
    currency: "USD",
    fx_rate: changedRule ? "1.1195" : "1.1169",
    fx_rate_date: changedRule ? "2026-01-06" : "2026-01-02",
  });
  const sale = b.sell({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    trade_date: "2026-02-02",
    value_date: "2026-02-04",
    quantity: "2",
    unit_price: "300",
    currency: "USD",
    fx_rate: "1.1",
    fx_rate_date: "2026-02-02",
  });
  if (changedRule) {
    b.settings(
      mergeSettings(DEFAULT_SETTINGS, {
        fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, etc: "value_date" },
      } as Partial<Settings>),
    );
  }
  return { events: b.build(), cheap, dear, sale };
};

const gainOf = (events: readonly LedgerEvent[], saleId: string): string => {
  const state = projectLedger(events);
  const gain = state.gains.find((entry) => entry.event_id === saleId);
  return gain?.gain_eur_rounded.amount.toString() ?? "none";
};

/** The lot left open: whose purchase it came from. */
const openLotSource = (events: readonly LedgerEvent[]): string[] =>
  fiscalLots(projectLedger(events), "ast_gold")
    .filter((lot) => !lot.closed)
    .map((lot) => lot.source_event_id);

describe("the lot of a correction keeps the place of its original", () => {
  it("a rate correction moves the gain by the rate, not by swapping lots (the reviewer's case)", async () => {
    const { events, cheap, dear, sale } = ledger();
    // 600 / 1.1 − 200 / 1.1169 = 366.39
    expect(gainOf(events, sale.id)).toBe("366.39");
    const store = new TestStore(events);
    const deps = testDeps(store);
    const corrected = await correctEvent(
      deps,
      cheap.id,
      { ...stripped(cheap), fx_rate: "1.1195", fx_rate_date: "2026-01-06" } as Draft,
      "tipo",
    );
    const after = (await store.load()).events;
    // 600 / 1.1 − 200 / 1.1195 = 366.80: only the rate moved it.
    expect(gainOf(after, sale.id)).toBe("366.8");
    expect(openLotSource(after)).toEqual([dear.id]);
    expect(corrected.event.id).not.toBe(cheap.id);
  });

  it("follows the chain: a correction of a correction keeps the root's place", async () => {
    const { events, cheap, dear, sale } = ledger();
    const store = new TestStore(events);
    const deps = testDeps(store);
    const first = await correctEvent(
      deps,
      cheap.id,
      { ...stripped(cheap), notes: "una" } as Draft,
      "primera",
    );
    const second = await correctEvent(
      deps,
      first.event.id,
      { ...stripped(cheap), fx_rate: "1.1195", fx_rate_date: "2026-01-06" } as Draft,
      "segunda",
    );
    const after = (await store.load()).events;
    expect(second.event.corrects_id).toBe(first.event.id);
    expect(gainOf(after, sale.id)).toBe("366.8");
    expect(openLotSource(after)).toEqual([dear.id]);
  });

  it("holds for the chain of `atlas fx correct` after a change of rule", async () => {
    const { events, dear, sale } = ledger(true);
    const store = new TestStore(events);
    const deps = testDeps(store);
    const prepared = await prepareRateCorrections(deps, history, 30, "criterio 25");
    await writeRateCorrections(deps, prepared);
    const after = (await store.load()).events;
    // The cheap purchase and the sale corrected, appended at the end of the
    // file; the sale still consumes the cheap lot, and the dear one stays open.
    expect(prepared.chain.filter((event) => event.type !== "reversal")).toHaveLength(2);
    expect(openLotSource(after)).toEqual([dear.id]);
    const saleNow = after.find((event) => event.corrects_id === sale.id)?.id as string;
    // 600 / 1.1026 − 200 / 1.1195 = 365.52
    expect(gainOf(after, saleNow)).toBe("365.52");
  });
});

/** An event as a draft: without its envelope and its fingerprint. */
const stripped = (event: LedgerEvent): Draft => {
  const {
    schema_version: _v,
    id: _id,
    recorded_at: _r,
    fingerprint: _f,
    ...rest
  } = event as LedgerEvent & { fingerprint?: string };
  return rest as unknown as Draft;
};
