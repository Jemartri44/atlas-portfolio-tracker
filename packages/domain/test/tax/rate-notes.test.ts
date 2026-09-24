// A line of the report that depends on an ECB rate in doubt carries a note
// with its code (ADR-0029, point 8; ADR-0024; feature 012, block 4) — and the
// note moves **no** figure. Mutant 13 of prompt 012 §5.

import { describe, expect, it } from "vitest";
import { boxesOf } from "../../src/tax/boxes/boxes.js";
import { taxYear, taxYearWithChain } from "../../src/tax/year.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

/** Gold (an ETC: fiscal date = trade date) bought in dollars in 2027 and sold in 2028. */
const ledger = (buyRateDate = "2027-03-01") => {
  const b = new LedgerBuilder();
  catalogue(b);
  const buy = b.buy({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    trade_date: "2027-03-01",
    value_date: "2027-03-03",
    quantity: "10",
    unit_price: "100",
    currency: "USD",
    fx_rate: "1.1",
    fx_rate_date: buyRateDate,
  });
  const sell = b.sell({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    trade_date: "2028-05-02",
    value_date: "2028-05-04",
    quantity: "10",
    unit_price: "130",
    currency: "USD",
    fx_rate: "1.2",
    fx_rate_date: "2028-05-02",
  });
  const dividend = b.dividend({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    value_date: "2028-03-01",
    gross: "10",
    currency: "USD",
    fx_rate: "1.15",
    fx_rate_date: "2028-03-01",
  });
  return { events: b.build(), buy, sell, dividend };
};

const today = "2029-06-01";

describe("the notes of the ECB rates in the report", () => {
  it("notes a sale whose purchase has a rate in doubt, and moves no figure (mutant 13)", () => {
    const { events, buy, sell } = ledger();
    const plain = taxYear(events, 2028, { today });
    const noted = taxYear(events, 2028, {
      today,
      rateFindings: [{ event_id: buy.id, code: "fx_rate_mismatch" }],
    });
    expect(noted.notes.filter((entry) => entry.code === "tax_fx_rate_finding")).toEqual([
      {
        code: "tax_fx_rate_finding",
        event_id: sell.id,
        message: expect.any(String),
        // Criterion 25 (ADR-0029, point 10): corrected by rectification, never recalculated.
        details: { criterion: "25", events: [buy.id], codes: ["fx_rate_mismatch"] },
      },
    ]);
    // The figures are the ledger's, with or without the note.
    expect(
      noted.capital_gains.lines.map((line) => line.computable_eur_rounded.amount.toString()),
    ).toEqual(
      plain.capital_gains.lines.map((line) => line.computable_eur_rounded.amount.toString()),
    );
    expect(noted.base_eur.amount.toString()).toBe(plain.base_eur.amount.toString());
    expect(plain.notes.some((entry) => entry.code === "tax_fx_rate_finding")).toBe(false);
  });

  it("notes a dividend with its own finding, and carries the notes to the boxes", () => {
    const { events, dividend } = ledger();
    const { report, chain } = taxYearWithChain(events, 2028, {
      today,
      rateFindings: [{ event_id: dividend.id, code: "fx_rate_date_not_latest" }],
    });
    expect(
      report.notes
        .filter((entry) => entry.code === "tax_fx_rate_finding")
        .map((entry) => entry.event_id),
    ).toEqual([dividend.id]);
    expect(boxesOf(report, chain).notes.map((entry) => entry.code)).toContain(
      "tax_fx_rate_finding",
    );
  });

  it("notes a rate dated after the fiscal date without any history", () => {
    // The purchase's rate is dated after its fiscal date (the trade date).
    const { events, buy, sell } = ledger("2027-03-03");
    const report = taxYear(events, 2028, { today });
    expect(
      report.notes.filter((entry) => entry.code === "tax_fx_rate_date_after_fiscal_date"),
    ).toEqual([
      expect.objectContaining({
        event_id: sell.id,
        details: { criterion: "25", events: [buy.id] },
      }),
    ]);
  });

  it("notes a standalone fee with a finding, on its own line", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const fee = b.fee({
      account_id: "acc_etf",
      value_date: "2028-02-01",
      amount: "12",
      currency: "USD",
      fx_rate: "1.1",
      fx_rate_date: "2028-02-01",
      fee_kind: "custody",
    });
    const report = taxYear(b.build(), 2028, {
      today,
      rateFindings: [{ event_id: fee.id, code: "fx_rate_mismatch" }],
    });
    expect(
      report.notes
        .filter((entry) => entry.code === "tax_fx_rate_finding")
        .map((entry) => entry.event_id),
    ).toEqual([fee.id]);
  });
});
