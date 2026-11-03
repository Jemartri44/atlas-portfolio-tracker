// Where a disposal is declared in the 2025 form when it is not a plain share,
// fund or coin: subscription rights in their own section (0341-0355), shares
// outside the EU regulated markets in "otros elementos patrimoniales" with key
// 2 (help of the Modelo 100, doubtful) and an exchange difference of currency
// with no box, pointing at key 4 as an inference.

import { describe, expect, it } from "vitest";
import { taxBoxes } from "../../src/tax/boxes/boxes.js";
import { transmissionSection } from "../../src/tax/boxes/concepts.js";
import type { BoxEntry, TaxBoxes } from "../../src/tax/boxes/report.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { buy, HAND_SETTINGS, sell, taxBuilder, text } from "./helpers.js";

const TODAY = "2035-01-01";

const at = (boxes: TaxBoxes, box: string): BoxEntry =>
  boxes.entries.find((item) => item.box === box) as BoxEntry;
const shown = (boxes: TaxBoxes, box: string): string | undefined => {
  const found = at(boxes, box);
  return found?.text ?? found?.amount_eur?.centsText();
};
const codes = (boxes: TaxBoxes): string[] => boxes.notes.map((note) => note.code);

describe("subscription rights (H5)", () => {
  // 10 S hold; a scrip hands over 10 rights at cost 0 and they are sold at
  // 0,50: transmission 5,00, acquisition 0,00, gain 5,00 (art. 37.1.a).
  it("go to their own section, 0341-0355, not to the shares", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2025-01-10", "10", "100");
    b.corporateAction({
      kind: "stock_dividend",
      asset_id: "stock_s",
      effective_date: "2025-05-05",
      effects: [
        {
          op: "grant",
          asset_id: "stock_t",
          per_account: [{ account_id: "acc_a", quantity: "10" }],
          unit_cost: "0",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2025-05-05",
          acquisition_date: "2025-05-05",
        },
        {
          op: "forced_sale",
          asset_id: "stock_t",
          per_account: [{ account_id: "acc_a", quantity: "10" }],
          unit_price: "0.5",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2025-05-05",
        },
      ],
    });
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    expect(["0343", "0346", "0347", "0351", "0354"].map((box) => shown(boxes, box))).toEqual([
      "5.00",
      "0.00",
      "5.00",
      "5.00",
      "5.00",
    ]);
    expect(boxes.entries.filter((item) => item.section === "listed_shares")).toEqual([]);
  });

  it("leaves bonus shares, a grant of the share itself, among the shares", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2025-01-10", "10", "100");
    b.corporateAction({
      kind: "stock_dividend",
      asset_id: "stock_s",
      effective_date: "2025-05-05",
      effects: [
        {
          op: "grant",
          per_account: [{ account_id: "acc_a", quantity: "1" }],
          unit_cost: "0",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2025-05-05",
          acquisition_date: "2025-05-05",
        },
      ],
    });
    sell(b, "stock_s", "2025-09-01", "11", "100");
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    expect(boxes.entries.some((item) => item.section === "rights")).toBe(false);
    expect(shown(boxes, "0339")).toBe("100.00");
  });
});

describe("a share outside the EU regulated markets (H4)", () => {
  const sale = (market: string) => {
    const b = taxBuilder(HAND_SETTINGS);
    b.asset("stock_us", { asset_type: "stock", transferable: false, market });
    buy(b, "stock_us", "2025-01-10", "10", "100");
    sell(b, "stock_us", "2025-09-01", "10", "80");
    return taxBoxes(b.build(), 2025, { today: TODAY });
  };

  // 10 bought at 100 and sold at 80: transmission 800, acquisition 1.000, loss
  // 200, all of it imputable.
  it("goes to 'otros elementos patrimoniales' with key 2, and says the section is doubtful", () => {
    const boxes = sale("XNYS");
    expect(
      ["1626", "1633", "1637", "1638", "1639", "0385"].map((box) => shown(boxes, box)),
    ).toEqual(["2", "800.00", "1000.00", "200.00", "200.00", "200.00"]);
    expect(boxes.entries.some((item) => item.section === "listed_shares")).toBe(false);
    expect(codes(boxes)).toContain("tax_box_section_doubtful");
    // 0423 adds 0385 in its own label: the total keeps the loss.
    expect(shown(boxes, "0423")).toBe("200.00");
  });

  it("stays among the shares on an EU market, or when the market is unknown", () => {
    for (const market of ["XMAD", "somewhere"]) {
      const boxes = sale(market);
      expect(shown(boxes, "0337")).toBe("200.00");
      expect(codes(boxes)).not.toContain("tax_box_section_doubtful");
    }
    expect(transmissionSection("stock", "capital_gain")).toBe("listed_shares");
    expect(transmissionSection("stock", "capital_gain", { market: "Nasdaq GS" })).toBe(
      "other_shares",
    );
    expect(transmissionSection("etf", "capital_gain", { market: "XNYS" })).toBe("etf");
  });
});

describe("an exchange difference of currency (H7)", () => {
  // 1.000 USD bought for 800 € (1,25) and sold for 850 € (≈1,1765): +50,00.
  it("keeps no box and names key 4 of 'otros elementos' as an inference", () => {
    const b = new LedgerBuilder();
    b.settings(HAND_SETTINGS);
    b.account("acc_us", { platform: "broker", country: "IE" });
    b.deposit({ account_id: "acc_us", value_date: "2025-01-02", amount: "800" });
    const exchange = (date: string, sold: [string, string], bought: [string, string]) =>
      b.fx({
        account_id: "acc_us",
        value_date: date,
        sold_amount: sold[0],
        sold_currency: sold[1],
        bought_amount: bought[0],
        bought_currency: bought[1],
        fee: "0",
        fee_currency: "EUR",
        ...(sold[1] === "USD" ? { fx_rate_sold: "1.1765" } : {}),
        fx_rate_bought: bought[1] === "USD" ? "1.25" : "1",
        fx_rate_date: date,
      });
    exchange("2025-02-03", ["800", "EUR"], ["1000", "USD"]);
    exchange("2025-06-02", ["1000", "USD"], ["850", "EUR"]);
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    const other = boxes.entries.filter((item) => item.section === "other");
    expect(other.find((item) => item.concept === "gp.other.key")?.text).toBe("4");
    expect(text(other.find((item) => item.concept === "gp.other.gain")?.amount_eur)).toBe("50");
    expect(other.every((item) => item.box === undefined)).toBe(true);
    expect(codes(boxes)).toContain("tax_box_other_inferred");
  });
});
