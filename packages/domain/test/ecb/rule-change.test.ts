// What a change of `fiscal_date_rule` does to the ECB rates of the ledger
// (ADR-0029, point 10; block 6 of prompt 012; criterion 25). Mutants 15 and
// 20 of prompt 012 §5.

import { describe, expect, it } from "vitest";
import { readEcbZipCsv } from "../../src/ecb/history.js";
import {
  prepareRateCorrections,
  rateCorrections,
  ruleChangeRates,
  writeRateCorrections,
} from "../../src/ecb/rule-change.js";
import { ConflictError } from "../../src/errors.js";
import type { LoadedLedger } from "../../src/ports/ledger-store.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { ecbFixture } from "../fixtures-path.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { testDeps } from "../usecases/helpers.js";

const history = readEcbZipCsv(ecbFixture("eurofxref-hist.csv"));

const rules = (patch: Record<string, string>): Settings =>
  mergeSettings(DEFAULT_SETTINGS, {
    fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, ...patch },
  } as Partial<Settings>);

/**
 * A gold ETC (fiscal date = trade date by default) bought in dollars on Friday
 * 2026-01-02, settled on Tuesday the 6th, at the official rate of the 2nd.
 */
const ledger = (changed?: Record<string, string>) => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.asset("ast_usfund", { currency: "USD" }); // a fund: fiscal date = value date
  const gold = b.buy({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    trade_date: "2026-01-02",
    value_date: "2026-01-06",
    quantity: "2",
    currency: "USD",
    fx_rate: "1.1169",
    fx_rate_date: "2026-01-02",
  });
  const sale = b.sell({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    trade_date: "2026-01-05",
    value_date: "2026-01-07",
    quantity: "1",
    currency: "USD",
    fx_rate: "1.1182",
    fx_rate_date: "2026-01-05",
  });
  // A fund in dollars dated by its value date, the 6th.
  const fund = b.buy({
    account_id: "acc_etf",
    asset_id: "ast_usfund",
    trade_date: "2026-01-02",
    value_date: "2026-01-06",
    currency: "USD",
    fx_rate: "1.1195",
    fx_rate_date: "2026-01-06",
  });
  // The same fund in euros: its rate "1" dated on the 6th too.
  const euro = b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    trade_date: "2026-01-02",
    value_date: "2026-01-06",
  });
  if (changed !== undefined) {
    // The rule changed afterwards, as `atlas settings set` records it.
    b.settings(rules(changed));
  }
  return { events: b.build(), gold, sale, fund, euro };
};

describe("ruleChangeRates: said before the change is confirmed (mutant 15)", () => {
  it("names the lines whose rate stops being the one of their new fiscal date", () => {
    const { events, gold, sale } = ledger();
    const impact = ruleChangeRates(
      history,
      events,
      DEFAULT_SETTINGS,
      rules({ etc: "value_date" }),
      30,
    );
    expect(impact.checked).toBe(true);
    expect(impact.lines).toEqual([
      {
        event_id: gold.id,
        path: "fx_rate",
        currency: "USD",
        rate: "1.1169",
        rate_date: "2026-01-02",
        fiscal_date: "2026-01-02",
        new_fiscal_date: "2026-01-06",
        verdict: "not_official",
        official: { rate: "1.1195", date: "2026-01-06" },
      },
      expect.objectContaining({
        event_id: sale.id,
        new_fiscal_date: "2026-01-07",
        verdict: "not_official",
        official: { rate: "1.1208", date: "2026-01-07" },
      }),
    ]);
  });

  it("says what is known without a history, and nothing it cannot know", () => {
    const { events, gold, fund, euro } = ledger();
    // To the trade date: the fund's rate of the 6th is now after its fiscal date.
    const back = ruleChangeRates(
      undefined,
      events,
      DEFAULT_SETTINGS,
      rules({ fund: "trade_date" }),
      30,
    );
    expect(back.checked).toBe(false);
    expect(back.lines.map((line) => [line.event_id, line.verdict, line.official])).toEqual([
      [fund.id, "after_fiscal_date", undefined],
      // The euro needs no history: its rate is 1, dated on the 2nd.
      [euro.id, "after_fiscal_date", { rate: "1", date: "2026-01-02" }],
    ]);
    // To the value date: the gold's rate of the 2nd may or may not be the one
    // of the 6th, and without a history nobody can say it.
    const forward = ruleChangeRates(
      undefined,
      events,
      DEFAULT_SETTINGS,
      rules({ etc: "value_date" }),
      30,
    );
    expect(forward.lines.find((line) => line.event_id === gold.id)?.verdict).toBe("unverifiable");
  });

  it("with a history, also gives the official rate of a line dated after its fiscal date", () => {
    const { events, fund } = ledger();
    const impact = ruleChangeRates(
      history,
      events,
      DEFAULT_SETTINGS,
      rules({ fund: "trade_date" }),
      30,
    );
    expect(impact.lines.find((line) => line.event_id === fund.id)).toMatchObject({
      verdict: "after_fiscal_date",
      official: { rate: "1.1169", date: "2026-01-02" },
    });
  });

  it("says nothing when the fiscal dates do not move, or the rate is also the new date's", () => {
    const { events } = ledger();
    expect(ruleChangeRates(history, events, DEFAULT_SETTINGS, DEFAULT_SETTINGS, 30).lines).toEqual(
      [],
    );
    // Saturday and Sunday share Friday's publication: the rate stays right.
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      trade_date: "2026-01-03",
      value_date: "2026-01-04",
      currency: "USD",
      fx_rate: "1.1169",
      fx_rate_date: "2026-01-02",
    });
    expect(
      ruleChangeRates(history, b.build(), DEFAULT_SETTINGS, rules({ etc: "value_date" }), 30).lines,
    ).toEqual([]);
  });

  it("does not call late a rate dated on the new fiscal date itself (review of PR #75)", () => {
    // Bought on the 2nd, settled on the 6th, at the rate of the 6th: by the
    // value date its rate is exactly the one of its fiscal date.
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      trade_date: "2026-01-02",
      value_date: "2026-01-06",
      currency: "USD",
      fx_rate: "1.1195",
      fx_rate_date: "2026-01-06",
    });
    const events = b.build();
    expect(
      ruleChangeRates(history, events, DEFAULT_SETTINGS, rules({ etc: "value_date" }), 30).lines,
    ).toEqual([]);
    expect(
      ruleChangeRates(undefined, events, DEFAULT_SETTINGS, rules({ etc: "value_date" }), 30).lines,
    ).toEqual([expect.objectContaining({ verdict: "unverifiable" })]);
  });

  it("cannot verify what the history does not reach", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      trade_date: "2026-03-31",
      value_date: "2026-04-02",
      currency: "USD",
      fx_rate: "1.1091",
      fx_rate_date: "2026-03-31",
    });
    const impact = ruleChangeRates(
      history,
      b.build(),
      DEFAULT_SETTINGS,
      rules({ etc: "value_date" }),
      30,
    );
    expect(impact.lines.map((line) => line.verdict)).toEqual(["unverifiable"]);
  });
});

describe("rateCorrections: the lines to correct under the rule in force", () => {
  it("are the ones dated on another day than their fiscal date's publication", () => {
    const { events: changed, gold, sale } = ledger({ etc: "value_date" });
    const state = projectLedger(changed);
    expect(rateCorrections(history, state, changed, 30).map((line) => line.event_id)).toEqual([
      gold.id,
      sale.id,
    ]);
    // Without a history only the euro can be corrected, and only a date after the fiscal one.
    expect(rateCorrections(undefined, state, changed, 30)).toEqual([]);
    const { events: fundsBack } = ledger({ fund: "trade_date" });
    const back = projectLedger(fundsBack);
    expect(rateCorrections(undefined, back, fundsBack, 30)).toEqual([
      expect.objectContaining({
        path: "fx_rate",
        datePath: "fx_rate_date",
        currency: "EUR",
        official: { rate: "1", date: "2026-01-02" },
      }),
    ]);
  });

  it("leave out a typed rate of the right day, and a line already right", () => {
    const { events } = ledger();
    const state = projectLedger(events);
    expect(rateCorrections(history, state, events, 30)).toEqual([]);
    // A typed rate of the right day with another value: the check flags it, not this.
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      trade_date: "2026-01-02",
      currency: "USD",
      fx_rate: "1.2",
      fx_rate_date: "2026-01-02",
    });
    const typed = b.build();
    expect(rateCorrections(history, projectLedger(typed), typed, 30)).toEqual([]);
  });
});

/** The ledger with the rule already changed, in a store the use cases write to. */
const changedStore = (patch: Record<string, string>) => {
  const { events, ...rest } = ledger(patch);
  return { store: new TestStore(events), ...rest };
};

describe("the correction chain (mutant 20)", () => {
  it("reverses and corrects every line, in one write, with the official rates", async () => {
    const { store, gold, sale } = changedStore({ etc: "value_date" });
    const deps = testDeps(store);
    const before = (await store.load()).lines.length;
    const prepared = await prepareRateCorrections(deps, history, 30, "criterio 25");
    expect(prepared.corrections.map((line) => line.event_id)).toEqual([gold.id, sale.id]);
    expect(prepared.chain.map((event) => event.type)).toEqual([
      "reversal",
      "buy",
      "reversal",
      "sell",
    ]);
    expect(prepared.chain[1]).toMatchObject({
      corrects_id: gold.id,
      fx_rate: "1.1195",
      fx_rate_date: "2026-01-06",
      quantity: "2",
    });
    expect(prepared.chain[3]).toMatchObject({
      corrects_id: sale.id,
      fx_rate: "1.1208",
      fx_rate_date: "2026-01-07",
    });
    await writeRateCorrections(deps, prepared);
    const after = await store.load();
    expect(after.lines.length).toBe(before + 4);
    // Once written, nothing is left to correct.
    expect(rateCorrections(history, projectLedger(after.events), after.events, 30)).toEqual([]);
  });

  it("is written whole or not at all: a store that fails leaves the ledger as it was", async () => {
    const { store } = changedStore({ etc: "value_date" });
    const deps = testDeps(store);
    const before = await store.load();
    const prepared = await prepareRateCorrections(deps, history, 30, "criterio 25");
    // A double that accepts one append and fails every other one: a chain in
    // two writes would leave the first pair behind.
    let appends = 0;
    const failing = {
      ...deps,
      store: {
        load: (): Promise<LoadedLedger> => store.load(),
        append: async (events: readonly LedgerEvent[], etag: string) => {
          appends += 1;
          if (appends > 1) {
            throw new ConflictError();
          }
          return store.append(events, etag);
        },
        replace: store.replace.bind(store),
      },
    };
    await writeRateCorrections(failing as never, prepared);
    expect(appends).toBe(1);
    expect((await store.load()).lines.length).toBe(before.lines.length + 4);
    // And on a stale etag nothing at all is written.
    const stale = await prepareRateCorrections(deps, history, 30, "criterio 25");
    await expect(
      writeRateCorrections(deps, { ...stale, etag: before.etag }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("corrects only the lines asked for", async () => {
    const { store, sale } = changedStore({ etc: "value_date" });
    const prepared = await prepareRateCorrections(testDeps(store), history, 30, "x", [sale.id]);
    expect(prepared.chain.map((event) => event.type)).toEqual(["reversal", "sell"]);
  });

  it("proposes nothing when nothing is to be corrected", async () => {
    const { events } = ledger();
    const prepared = await prepareRateCorrections(
      testDeps(new TestStore(events)),
      history,
      30,
      "x",
    );
    expect(prepared.chain).toEqual([]);
  });

  it("corrects a purchase whose lot was sold without touching the sale", async () => {
    // What ADR-0003 refuses is a rectification that leaves another event
    // invalid; the corrected purchase keeps the lot the sale consumes.
    const { store, gold } = changedStore({ etc: "value_date" });
    const prepared = await prepareRateCorrections(testDeps(store), history, 30, "x", [gold.id]);
    expect(prepared.chain.map((event) => event.type)).toEqual(["reversal", "buy"]);
    expect(prepared.state.invalid).toEqual([]);
  });
});
