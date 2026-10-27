// The wash-sale rule on foreign currency: art. 33.5.e) LIRPF, one year after
// the loss only, as DGT V1613-25 answers for "pérdidas patrimoniales originadas
// por las diferencias de cambio en la conversión de las divisas a euros".

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { reportOf, rowsAddUpToTheEngine, text } from "./helpers.js";

const ledger = () => {
  const b = new LedgerBuilder();
  b.settings(DEFAULT_SETTINGS);
  b.account("acc_us", { platform: "broker", country: "IE" });
  b.asset("stk_us", { asset_type: "stock", currency: "USD", transferable: false });
  b.deposit({ account_id: "acc_us", value_date: "2027-01-04", amount: "5000" });
  return b;
};

const exchange = (
  b: LedgerBuilder,
  date: string,
  direction: "buy" | "sell",
  usd: string,
  eur: string,
  rate: string,
) =>
  b.fx({
    account_id: "acc_us",
    value_date: date,
    sold_amount: direction === "buy" ? eur : usd,
    sold_currency: direction === "buy" ? "EUR" : "USD",
    bought_amount: direction === "buy" ? usd : eur,
    bought_currency: direction === "buy" ? "USD" : "EUR",
    fee: "0",
    fee_currency: "EUR",
    ...(direction === "buy" ? {} : { fx_rate_sold: rate }),
    fx_rate_bought: direction === "buy" ? rate : "1",
    fx_rate_date: date,
  });

/** What the year integrates of its exchange differences, and what it leaves deferred. */
const year = (b: LedgerBuilder, y: number) => {
  const report = reportOf(b.build(), y);
  return {
    lines: report.capital_gains.currency_lines.map((line) => [
      line.kind,
      text(line.gain_eur_rounded),
      text(line.deferred_eur.roundToCents()),
      text(line.computable_eur_rounded),
    ]),
    balance: text(report.capital_gains.balance_eur),
  };
};

describe("the wash-sale rule on currency (V1613-25)", () => {
  /**
   * Case C3 of the audit of 2026-10-27: 1.000 $ for 1.000 € in January, back
   * to 800 € in March (−200), and 1.000 $ again for 800 € in April.
   */
  const c3 = () => {
    const b = ledger();
    exchange(b, "2027-01-11", "buy", "1000", "1000", "1");
    exchange(b, "2027-03-01", "sell", "1000", "800", "1.25");
    exchange(b, "2027-04-01", "buy", "1000", "800", "1.25");
    return b;
  };

  it("defers the loss of a conversion when the currency is bought again within the year (case C3)", () => {
    expect(year(c3(), 2027)).toEqual({
      lines: [["conversion", "-200", "-200", "0"]],
      balance: "0",
    });
  });

  it("leaves it deferred in a year that converts none of the dollars bought again", () => {
    const b = c3();
    exchange(b, "2028-06-01", "buy", "100", "80", "1.25");
    const { rows, engine } = rowsAddUpToTheEngine(b.build(), 2028);
    expect([year(b, 2028).balance, rows, engine]).toEqual(["0", "0", "0"]);
  });

  it("brings it back when the dollars bought again are converted and none are bought after", () => {
    const b = c3();
    exchange(b, "2029-06-01", "sell", "1000", "800", "1.25");
    // Its own difference is nil, and the −200 of 2027 comes back with it.
    expect(year(b, 2029)).toEqual({
      lines: [["conversion", "0", "0", "-200"]],
      balance: "-200",
    });
    const { rows, engine } = rowsAddUpToTheEngine(b.build(), 2029);
    expect(rows).toBe(engine);
  });

  it("defers in proportion to what is bought again, and one day past the year is outside", () => {
    const b = ledger();
    exchange(b, "2027-01-11", "buy", "1000", "1000", "1");
    exchange(b, "2027-03-01", "sell", "1000", "800", "1.25");
    exchange(b, "2028-03-01", "buy", "250", "200", "1.25");
    exchange(b, "2028-03-02", "buy", "750", "600", "1.25");
    // A quarter of the dollars on the last day of the window: a quarter of the loss.
    expect(year(b, 2027)).toEqual({
      lines: [["conversion", "-200", "-50", "-150"]],
      balance: "-150",
    });
  });

  it("does not defer on a purchase of shares with the dollars: investing imputes nothing", () => {
    const b = c3();
    b.buy({
      account_id: "acc_us",
      asset_id: "stk_us",
      value_date: "2027-05-03",
      quantity: "10",
      unit_price: "100",
      currency: "USD",
      fx_rate: "1.25",
    });
    // The deferral rides on to the next dollars, and stays deferred.
    expect(year(b, 2027).balance).toBe("0");
    expect(year(b, 2028).balance).toBe("0");
  });

  it("keeps deferring what a conversion releases when the currency is bought again (#21)", () => {
    const b = c3();
    exchange(b, "2028-06-01", "sell", "1000", "800", "1.25");
    exchange(b, "2028-07-01", "buy", "1000", "800", "1.25");
    expect(year(b, 2028).balance).toBe("0");
    exchange(b, "2030-06-01", "sell", "1000", "800", "1.25");
    expect(year(b, 2030).balance).toBe("-200");
  });

  it("lets each dollar bought again defer one loss only, and brings back part of a lot (#19)", () => {
    const b = ledger();
    exchange(b, "2027-01-11", "buy", "2000", "2000", "1");
    exchange(b, "2027-03-01", "sell", "1000", "800", "1.25");
    exchange(b, "2027-04-01", "sell", "1000", "800", "1.25");
    // March takes all of May; April, finding May used, takes June.
    exchange(b, "2027-05-03", "buy", "1000", "800", "1.25");
    exchange(b, "2027-06-01", "buy", "2000", "1600", "1.25");
    // Half of the May lot, which carries the −200 of March: −100 comes back.
    exchange(b, "2027-08-02", "sell", "500", "400", "1.25");
    expect(year(b, 2027)).toEqual({
      lines: [
        ["conversion", "-200", "-200", "0"],
        ["conversion", "-200", "-200", "0"],
        ["conversion", "0", "0", "-100"],
      ],
      balance: "-100",
    });
    const early = reportOf(b.build(), 2027, "2027-12-31");
    expect(early.capital_gains.currency_lines.map((line) => line.provisional_until)).toEqual([
      "2028-03-01",
      "2028-04-01",
      "2028-08-02",
    ]);
  });

  it("does not apply to the cover of dollars spent without having them", () => {
    const b = ledger();
    b.buy({
      account_id: "acc_us",
      asset_id: "stk_us",
      value_date: "2027-02-01",
      quantity: "10",
      unit_price: "100",
      currency: "USD",
      fx_rate: "1.25",
    });
    exchange(b, "2027-02-02", "buy", "1000", "909.09", "1.1");
    exchange(b, "2027-03-01", "buy", "1000", "909.09", "1.1");
    expect(year(b, 2027).lines).toEqual([["cover", "-109.09", "0", "-109.09"]]);
  });
});
