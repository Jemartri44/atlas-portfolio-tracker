// The exchange differences of the currency in the report (spec 029): what each
// one applies, what the notes say about what the lots do not see, the other
// reading of criterion #4 and where they go in the layout by box.

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { boxesOf } from "../../src/tax/boxes/boxes.js";
import { taxYearWithChain } from "../../src/tax/year.js";
import { reportOf, taxBuilder, text } from "./helpers.js";

/** 1,000 EUR → 1,200 USD at 1.2 in a foreign account. */
const dollars = (settings = DEFAULT_SETTINGS) => {
  const b = taxBuilder(settings);
  b.asset("stk_us", { asset_type: "stock", currency: "USD", transferable: false });
  b.fx({
    account_id: "acc_b",
    value_date: "2027-01-05",
    sold_amount: "1000",
    sold_currency: "EUR",
    bought_amount: "1200",
    bought_currency: "USD",
    fee: "0",
    fee_currency: "EUR",
    fx_rate_bought: "1.2",
    fx_rate_date: "2027-01-05",
  });
  return b;
};

const backToEuros = (b: ReturnType<typeof taxBuilder>, usd: string, eur: string, rate: string) =>
  b.fx({
    account_id: "acc_b",
    value_date: "2027-06-01",
    sold_amount: usd,
    sold_currency: "USD",
    bought_amount: eur,
    bought_currency: "EUR",
    fee: "0",
    fee_currency: "EUR",
    fx_rate_sold: rate,
    fx_rate_bought: "1",
    fx_rate_date: "2027-06-01",
  });

describe("an exchange difference in the report", () => {
  it("is a capital loss, computable with no currency acquired again in the year after, and its box has no number", () => {
    const b = dollars();
    // 1,200 USD that cost 1,000 EUR, back at 1.3: 923.08 EUR, −76.92.
    backToEuros(b, "1200", "923.0769230769", "1.3");
    const { report, chain } = taxYearWithChain(b.build(), 2027, { today: "2030-01-01" });
    const [line] = report.capital_gains.currency_lines;
    expect([line?.kind, text(line?.gain_eur_rounded), line?.criteria]).toEqual([
      "conversion",
      "-76.92",
      ["4", "4:currency_fifo", "4:currency_wash_sale", "6"],
    ]);
    expect(text(report.capital_gains.losses_eur)).toBe("-76.92");
    expect(text(report.capital_gains.balance_eur)).toBe("-76.92");
    expect(report.doubtful.find((d) => d.criterion === "4:currency_wash_sale")?.direction).toBe(
      "both",
    );
    const boxes = boxesOf(report, chain);
    const loss = boxes.entries.find((entry) => entry.concept === "gp.other.loss");
    expect([loss?.row?.currency, text(loss?.amount_eur), loss?.box]).toEqual([
      "USD",
      "-76.92",
      undefined,
    ]);
    expect(boxes.entries.find((entry) => entry.concept === "gp.other.name")?.text).toBe(
      "Divisa USD",
    );
  });

  it("names what the broker converted with its own criterion", () => {
    const b = taxBuilder();
    b.asset("stk_us", { asset_type: "stock", currency: "USD", transferable: false });
    b.dividend({
      account_id: "acc_b",
      asset_id: "stk_us",
      value_date: "2027-06-15",
      gross: "100",
      withholding_origin: "15",
      withholding_spain: "0",
      currency: "USD",
      fx_rate: "1.25",
      source_country: "US",
      broker_settled_eur: "67",
    });
    // 85 USD net at 1.25 = 68 EUR, credited as 67: −1.
    const [line] = reportOf(b.build(), 2027).capital_gains.currency_lines;
    expect([line?.kind, text(line?.gain_eur_rounded), line?.criteria]).toEqual([
      "auto_conversion",
      "-1",
      ["4", "4:currency_wash_sale", "4:auto_conversion", "6"],
    ]);
  });

  it("says that a withdrawal of currency leaves at cost", () => {
    const b = dollars();
    const out = b.withdrawal({
      account_id: "acc_b",
      value_date: "2027-03-01",
      amount: "100",
      currency: "USD",
      fx_rate: "1.1",
    });
    const report = reportOf(b.build(), 2027);
    expect(report.capital_gains.currency_lines).toEqual([]);
    expect(report.notes.find((n) => n.code === "tax_currency_withdrawn")?.details).toEqual({
      events: [out.id],
    });
  });

  it("has first in currency as the other reading when leg by leg is the one applied", () => {
    const b = dollars(mergeSettings(DEFAULT_SETTINGS, { fx_gain_method: "each_leg" }));
    const usd = { account_id: "acc_b", asset_id: "stk_us", quantity: "10", currency: "USD" };
    b.buy({ ...usd, value_date: "2027-01-11", unit_price: "120", fx_rate: "1.3" });
    b.sell({ ...usd, value_date: "2027-03-01", unit_price: "120", fx_rate: "1.5" });
    // Leg by leg: −123.08 on the shares, +123.08 on the dollars when they are sold at 1.2 on
    // 2028-01-10. First in currency, both are zero: 2027 would carry 123.08 less of loss.
    b.fx({
      account_id: "acc_b",
      value_date: "2028-01-10",
      sold_amount: "1200",
      sold_currency: "USD",
      bought_amount: "1000",
      bought_currency: "EUR",
      fee: "0",
      fee_currency: "EUR",
      fx_rate_sold: "1.2",
      fx_rate_bought: "1",
      fx_rate_date: "2028-01-10",
    });
    const item = reportOf(b.build(), 2027).doubtful.find((d) => d.criterion === "4");
    expect(text(item?.pending_difference_eur)).toBe("123.08");
  });
});
