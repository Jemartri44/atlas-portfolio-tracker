// The ledger's rates against the official history (ADR-0029, point 8).
// Mutants 6, 7 and 9 of prompt 012 §5.

import { describe, expect, it } from "vitest";
import { checkLedgerRates, foreignRatesOf } from "../../src/ecb/check.js";
import { readEcbZipCsv } from "../../src/ecb/history.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { ecbFixture } from "../fixtures-path.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const history = readEcbZipCsv(ecbFixture("eurofxref-hist.csv"));

/** A ledger with one purchase of gold (an ETC: fiscal date = trade date) in dollars. */
const ledgerWith = (buy: {
  trade_date: string;
  fx_rate: string;
  fx_rate_date: string;
  currency?: string;
}) => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.asset("ast_pound", { asset_type: "stock", currency: "GBP", transferable: false });
  b.buy({
    account_id: "acc_etf",
    asset_id: buy.currency === "GBP" ? "ast_pound" : "ast_gold",
    value_date: buy.trade_date,
    quantity: "1",
    unit_price: "100",
    currency: buy.currency ?? "USD",
    ...buy,
  });
  const events = b.build();
  return { events, state: projectLedger(events) };
};

const codes = (buy: Parameters<typeof ledgerWith>[0]): string[] => {
  const { events, state } = ledgerWith(buy);
  const check = checkLedgerRates(history, state, events, 30, "2026-03-31");
  return check.kind === "checked" ? check.findings.map((finding) => finding.code) : ["unchecked"];
};

describe("checkLedgerRates", () => {
  it("says nothing of a rate that is the official one of its fiscal date", () => {
    expect(
      codes({ trade_date: "2026-01-02", fx_rate: "1.1169", fx_rate_date: "2026-01-02" }),
    ).toEqual([]);
  });

  it("compares as numbers: 0.85950 is 0.8595 (mutant 6)", () => {
    expect(
      codes({
        trade_date: "2026-01-05",
        fx_rate: "0.85950",
        fx_rate_date: "2026-01-05",
        currency: "GBP",
      }),
    ).toEqual([]);
    expect(
      codes({
        trade_date: "2026-01-05",
        fx_rate: "0.86",
        fx_rate_date: "2026-01-05",
        currency: "GBP",
      }),
    ).toEqual(["fx_rate_mismatch"]);
  });

  it("marks a rate date that is not the last publication on or before the fiscal date, on both sides (mutant 7)", () => {
    // Before: the rate of the 2nd for a purchase of the 5th.
    expect(
      codes({ trade_date: "2026-01-05", fx_rate: "1.1169", fx_rate_date: "2026-01-02" }),
    ).toEqual(["fx_rate_date_not_latest"]);
    // **After**: the rate of the 5th for a purchase of the 2nd. The first
    // definition ("there is a closer publication") missed this one.
    const after = codes({
      trade_date: "2026-01-02",
      fx_rate: "1.1182",
      fx_rate_date: "2026-01-05",
    });
    expect(after).toContain("fx_rate_date_not_latest");
  });

  it("marks a rate dated on a day without publication", () => {
    expect(codes({ trade_date: "2025-12-29", fx_rate: "1.1", fx_rate_date: "2025-12-25" })).toEqual(
      ["fx_rate_date_unpublished", "fx_rate_date_not_latest"],
    );
  });

  it("marks a currency the ECB does not publish, one it stopped, and a date beyond the history", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("ast_lev", { asset_type: "stock", currency: "BGN", transferable: false });
    b.asset("ast_xau", { asset_type: "stock", currency: "XAU", transferable: false });
    for (const [asset, currency, date] of [
      ["ast_lev", "BGN", "2026-03-02"],
      ["ast_xau", "XAU", "2026-03-02"],
      ["ast_gold", "USD", "2026-04-01"],
    ] as const) {
      b.buy({
        account_id: "acc_etf",
        asset_id: asset,
        trade_date: date,
        value_date: date,
        currency,
        fx_rate: "2",
        fx_rate_date: date,
      });
    }
    const events = b.build();
    const check = checkLedgerRates(history, projectLedger(events), events, 30, "2026-04-01");
    expect(check.kind === "checked" && check.findings.map((finding) => finding.code)).toEqual([
      "fx_rate_currency_stale",
      "fx_rate_currency_unlisted",
      "fx_rate_not_yet_in_history",
    ]);
  });

  it("does not compare a line in euros, nor one that was reversed", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const wrong = b.buy({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      trade_date: "2026-01-02",
      value_date: "2026-01-02",
      currency: "USD",
      fx_rate: "9",
      fx_rate_date: "2026-01-02",
    });
    b.reversal(wrong.id);
    const events = b.build();
    const state = projectLedger(events);
    expect(foreignRatesOf(state, events)).toEqual([]);
    expect(checkLedgerRates(history, state, events, 30, "2026-03-31")).toMatchObject({
      kind: "checked",
      findings: [],
      compared: 0,
    });
  });

  it("says «unchecked» without a history, never «no findings» (mutant 9)", () => {
    const { events, state } = ledgerWith({
      trade_date: "2026-01-02",
      fx_rate: "9",
      fx_rate_date: "2026-01-02",
    });
    expect(checkLedgerRates(undefined, state, events, 30, "2026-03-31")).toEqual({
      kind: "unchecked",
      rates: 1,
    });
  });

  it("cross-checks the calendar in the years the ledger uses, as a warning", () => {
    const missing = readEcbZipCsv(ecbFixture("eurofxref-hist.csv").replace(/^2026-01-07.*\n/m, ""));
    const { events, state } = ledgerWith({
      trade_date: "2026-01-02",
      fx_rate: "1.1169",
      fx_rate_date: "2026-01-02",
    });
    const check = checkLedgerRates(missing, state, events, 30, "2026-03-31");
    expect(check.kind === "checked" && check.findings).toEqual([
      expect.objectContaining({ code: "target_calendar_mismatch", severity: "warning" }),
    ]);
    const extra = readEcbZipCsv(
      ecbFixture("eurofxref-hist.csv").replace(/^(2026-01-02)(.*)\n/m, "$1$2\n2026-01-01$2\n"),
    );
    const again = checkLedgerRates(extra, state, events, 30, "2026-03-31");
    expect(again.kind === "checked" && again.findings[0]?.message).toMatch(/closing day/);
  });
});
