// The rate proposed when recording and when a typed one asks for a
// confirmation (ADR-0029, points 3 and 7; decisions (e), (p) and (w)).
// Mutants 6 and 19 of prompt 012 §5.

import { describe, expect, it } from "vitest";
import { readEcbZipCsv } from "../../src/ecb/history.js";
import { firstRateDateOf, ratePointsOf } from "../../src/ecb/ledger-rates.js";
import {
  officialRatesOf,
  proposeRates,
  rateConfirmations,
  unpublishedRates,
} from "../../src/ecb/propose.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { ecbFixture } from "../fixtures-path.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const history = readEcbZipCsv(ecbFixture("eurofxref-hist.csv"));
const builder = new LedgerBuilder();
catalogue(builder);
builder.asset("ast_usfund", { currency: "USD" }); // a fund: fiscal date = value date
const state = projectLedger(builder.build());

/** A purchase of gold (an ETC: fiscal date = trade date) in dollars, without a rate. */
const goldBuy = {
  type: "buy",
  account_id: "acc_etf",
  asset_id: "ast_gold",
  trade_date: "2026-01-02",
  value_date: "2026-01-06",
  quantity: "1",
  unit_price: "100",
  currency: "USD",
  fee: "0",
  source: "manual",
};

describe("ratePointsOf", () => {
  it("dates each rate by the table the direction confirmed", () => {
    expect(ratePointsOf(state, goldBuy)).toEqual([
      {
        path: "fx_rate",
        datePath: "fx_rate_date",
        currency: "USD",
        reference: "2026-01-02",
        basis: "fiscal",
      },
    ]);
    // A fund in dollars: its fiscal date is the value date (mutant 19: never trade_date).
    const fundBuy = { ...goldBuy, asset_id: "ast_usfund" };
    expect(ratePointsOf(state, fundBuy)[0]?.reference).toBe("2026-01-06");
    const fx = {
      type: "fx_exchange",
      account_id: "acc_etf",
      value_date: "2026-01-07",
      sold_currency: "EUR",
      bought_currency: "USD",
      fx_rate_sold: "1",
      fx_rate_bought: "1.1",
      fx_rate_date: "2026-01-07",
    };
    expect(
      ratePointsOf(state, fx).map((point) => [
        point.path,
        point.currency,
        point.reference,
        point.basis,
      ]),
    ).toEqual([
      ["fx_rate_sold", "EUR", "2026-01-07", "business"],
      ["fx_rate_bought", "USD", "2026-01-07", "business"],
    ]);
    const action = {
      type: "corporate_action",
      asset_id: "ast_gold",
      effective_date: "2026-02-02",
      effects: [
        {
          op: "grant",
          currency: "USD",
          fx_rate: "1.1",
          fx_rate_date: "2026-02-03",
          acquisition_date: "2026-02-03",
        },
        { op: "forced_sale", currency: "USD", fx_rate: "1.1", fx_rate_date: "2026-02-02" },
        { op: "scale", factor: "2" },
        { op: "grant", currency: "USD" },
      ],
    };
    expect(
      ratePointsOf(state, action).map((point) => [point.path, point.reference, point.rate_date]),
    ).toEqual([
      ["effects[0].fx_rate", "2026-02-03", "2026-02-03"],
      ["effects[1].fx_rate", "2026-02-02", "2026-02-02"],
    ]);
  });

  it("has no point while a draft lacks what its reference depends on", () => {
    expect(ratePointsOf(state, { ...goldBuy, asset_id: "ast_missing" })).toEqual([]);
    expect(ratePointsOf(state, { ...goldBuy, asset_id: undefined })).toEqual([]);
    expect(ratePointsOf(state, { ...goldBuy, trade_date: undefined })).toEqual([]);
    expect(ratePointsOf(state, { ...goldBuy, currency: "" })).toEqual([]);
    expect(ratePointsOf(state, { type: "account_created" })).toEqual([]);
    expect(
      ratePointsOf(state, {
        type: "swap",
        from_asset_id: "ast_gold",
        trade_date: "2026-01-02",
        value_date: "2026-01-05",
        currency: "USD",
      })[0]?.reference,
    ).toBe("2026-01-02");
  });

  it("finds the first rate date of the ledger in the effects too", () => {
    const events = [
      {
        type: "corporate_action",
        effects: [{ op: "grant", fx_rate_date: "2025-11-03" }, { op: "scale" }],
      },
      { type: "buy", fx_rate_date: "2026-01-02" },
    ];
    expect(firstRateDateOf(events as never)).toBe("2025-11-03");
  });
});

describe("proposeRates", () => {
  it("fills the rate of the fiscal date from the history, as the history writes it", () => {
    const { draft, proposed } = proposeRates(history, state, goldBuy, 30);
    expect(draft).toMatchObject({ fx_rate: "1.1169", fx_rate_date: "2026-01-02" });
    expect(proposed).toHaveLength(1);
  });

  it("dates the euro from the fiscal date too, never from trade_date (mutant 19)", () => {
    const euroFund = {
      ...goldBuy,
      asset_id: "ast_world",
      currency: "EUR",
      trade_date: "2026-01-02",
      value_date: "2026-01-10",
    };
    // ast_world is a fund in euros: fiscal date 2026-01-10 is a Saturday → Friday the 9th.
    expect(proposeRates(history, state, euroFund, 30).draft).toMatchObject({
      fx_rate: "1",
      fx_rate_date: "2026-01-09",
    });
  });

  it("never overwrites what was typed, and proposes nothing it cannot resolve", () => {
    expect(proposeRates(history, state, { ...goldBuy, fx_rate: "1.2" }, 30).proposed).toEqual([]);
    expect(
      proposeRates(history, state, { ...goldBuy, fx_rate_date: "2026-01-02" }, 30).proposed,
    ).toEqual([]);
    const later = { ...goldBuy, trade_date: "2026-04-01", value_date: "2026-04-03" };
    const { draft, proposed } = proposeRates(history, state, later, 30);
    expect(proposed).toEqual([]);
    expect(draft).not.toHaveProperty("fx_rate");
  });

  it("fills the rates inside the effects of a corporate action", () => {
    const action = {
      type: "corporate_action",
      asset_id: "ast_gold",
      effective_date: "2026-02-02",
      effects: [{ op: "forced_sale", currency: "USD" }, { op: "scale" }],
    };
    const { draft } = proposeRates(history, state, action, 30);
    expect((draft.effects as Record<string, unknown>[])[0]).toMatchObject({
      fx_rate_date: "2026-02-02",
    });
    expect((action.effects[0] as Record<string, unknown>).fx_rate).toBeUndefined();
  });
});

describe("rateConfirmations", () => {
  it("asks only when the typed rate differs from a conclusive official one, by value", () => {
    // 0.85950 typed from the daily XML is the same rate as 0.8595 (mutant 6).
    const pounds = {
      ...goldBuy,
      currency: "GBP",
      trade_date: "2026-01-05",
      fx_rate: "0.85950",
      fx_rate_date: "2026-01-05",
    };
    expect(rateConfirmations(history, state, pounds, 30)).toEqual([]);
    const wrong = { ...pounds, fx_rate: "0.86" };
    expect(rateConfirmations(history, state, wrong, 30)).toEqual([
      {
        point: expect.objectContaining({ path: "fx_rate", rate: "0.86" }),
        official: { rate: "0.8595", date: "2026-01-05" },
      },
    ]);
  });

  it("asks when the date is not the one of the official rate", () => {
    const dated = {
      ...goldBuy,
      trade_date: "2026-01-05",
      fx_rate: "1.1169",
      fx_rate_date: "2026-01-02",
    };
    expect(rateConfirmations(history, state, dated, 30)).toHaveLength(1);
  });

  it("asks nothing where the history cannot say", () => {
    const later = { ...goldBuy, trade_date: "2026-04-01", value_date: "2026-04-03", fx_rate: "9" };
    expect(rateConfirmations(history, state, later, 30)).toEqual([]);
    expect(rateConfirmations(history, state, { ...goldBuy }, 30)).toEqual([]);
    expect(
      unpublishedRates(history, state, later, 30).map((entry) => entry.point.reference),
    ).toEqual(["2026-04-01"]);
    expect(
      officialRatesOf(history, state, { ...goldBuy, currency: "XAU" }, 30)[0]?.resolution.kind,
    ).toBe("currency_not_published");
  });
});

describe("without a history", () => {
  it("still dates the euro, and proposes or checks nothing else (decision (p))", () => {
    const euro = { ...goldBuy, asset_id: "ast_world", currency: "EUR", value_date: "2026-01-10" };
    expect(proposeRates(undefined, state, euro, 30).draft).toMatchObject({
      fx_rate: "1",
      fx_rate_date: "2026-01-09",
    });
    expect(proposeRates(undefined, state, goldBuy, 30).proposed).toEqual([]);
    expect(officialRatesOf(undefined, state, goldBuy, 30)[0]?.resolution).toEqual({
      kind: "no_history",
    });
    expect(rateConfirmations(undefined, state, { ...goldBuy, fx_rate: "9" }, 30)).toEqual([]);
    expect(unpublishedRates(undefined, state, goldBuy, 30)).toEqual([]);
  });
});

describe("the euro's missing half", () => {
  it("dates a euro rate of 1 that has no date, and leaves a foreign half alone", () => {
    const euro = {
      ...goldBuy,
      asset_id: "ast_world",
      currency: "EUR",
      fx_rate: "1",
      value_date: "2026-01-10",
    };
    expect(proposeRates(undefined, state, euro, 30).draft).toMatchObject({
      fx_rate: "1",
      fx_rate_date: "2026-01-09",
    });
    const dated = { ...euro, fx_rate: undefined, fx_rate_date: "2026-01-08" };
    expect(proposeRates(undefined, state, dated, 30).draft).toMatchObject({
      fx_rate: "1",
      fx_rate_date: "2026-01-08",
    });
    const half = { ...goldBuy, fx_rate: "1.2" };
    expect(proposeRates(history, state, half, 30).draft).not.toHaveProperty("fx_rate_date");
  });
});
