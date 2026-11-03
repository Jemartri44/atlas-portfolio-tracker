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
import { buy, HAND_SETTINGS, sell, taxBuilder } from "./helpers.js";

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

  // 100 S; a scrip hands over 100 rights R. 60 are sold in the event at 0,20
  // (12,00). The other 40 convert into 2 T (0,05), sold at 12: the shares of T
  // are shares, not rights, though their lots descend from the grant.
  it("leaves shares that come from converted rights among the shares", () => {
    const b = taxBuilder(HAND_SETTINGS);
    b.asset("stock_v", { asset_type: "stock", transferable: false, market: "XMAD" });
    buy(b, "stock_s", "2025-01-10", "100", "10");
    const grant = {
      op: "grant" as const,
      asset_id: "stock_t",
      per_account: [{ account_id: "acc_a", quantity: "100" }],
      unit_cost: "0",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2025-05-05",
      acquisition_date: "2025-05-05",
    };
    b.corporateAction({
      kind: "stock_dividend",
      asset_id: "stock_s",
      effective_date: "2025-05-05",
      effects: [
        grant,
        {
          op: "forced_sale",
          asset_id: "stock_t",
          per_account: [{ account_id: "acc_a", quantity: "60" }],
          unit_price: "0.2",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2025-05-05",
        },
      ],
    });
    b.corporateAction({
      kind: "share_class_change",
      asset_id: "stock_t",
      effective_date: "2025-05-20",
      effects: [{ op: "convert", to_asset_id: "stock_v", ratio: "0.05" }],
    });
    sell(b, "stock_v", "2025-09-01", "2", "12");
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    const rows = (section: string) =>
      boxes.entries
        .filter((item) => item.section === section && item.concept.endsWith(".transmission"))
        .map((item) => [item.row?.asset_id, item.amount_eur?.centsText()]);
    expect(rows("rights")).toEqual([["stock_t", "12.00"]]);
    expect(rows("listed_shares")).toEqual([["stock_v", "24.00"]]);
  });
});

describe("a share outside the EU regulated markets (H4)", () => {
  const sale = (market: string | undefined) => {
    const b = taxBuilder(HAND_SETTINGS);
    b.asset("stock_us", {
      asset_type: "stock",
      transferable: false,
      ...(market === undefined ? {} : { market }),
    });
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
    for (const market of ["XMAD", "somewhere", undefined]) {
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

  // Without a market Atlas knows, a share stays among "acciones negociadas",
  // which is wrong if it trades outside the EU: the output says so.
  it.each([
    ["with no market", undefined, true],
    ["with an unknown market", "somewhere", true],
    ["on an EU market", "XMAD", false],
  ])("notes a share %s", (_name, market, noted) => {
    const found = sale(market).notes.filter((entry) => entry.code === "tax_box_market_unknown");
    expect(found.map((entry) => entry.details)).toEqual(noted ? [{ assets: ["stock_us"] }] : []);
  });
});

describe("an exchange difference of currency (H7)", () => {
  // The bucket's dollars: euros bought into USD and sold back. Each pair of
  // rates is ECB-style (USD per EUR); the gain is proceeds − cost in euros.
  const roundTrip = (
    euros: string,
    dollars: string,
    rateIn: string,
    back: string,
    rateOut: string,
  ) => {
    const b = new LedgerBuilder();
    b.settings(HAND_SETTINGS);
    b.account("acc_us", { platform: "broker", country: "IE" });
    b.deposit({ account_id: "acc_us", value_date: "2025-01-02", amount: euros });
    b.fx({
      account_id: "acc_us",
      value_date: "2025-02-03",
      sold_amount: euros,
      sold_currency: "EUR",
      bought_amount: dollars,
      bought_currency: "USD",
      fee: "0",
      fee_currency: "EUR",
      fx_rate_bought: rateIn,
      fx_rate_date: "2025-02-03",
    });
    b.fx({
      account_id: "acc_us",
      value_date: "2025-06-02",
      sold_amount: dollars,
      sold_currency: "USD",
      bought_amount: back,
      bought_currency: "EUR",
      fee: "0",
      fee_currency: "EUR",
      fx_rate_sold: rateOut,
      fx_rate_bought: "1",
      fx_rate_date: "2025-06-02",
    });
    return b;
  };

  // 800 € → 1.000 USD at 1,25 (cost 800 €); back for the 850 € received:
  // transmission 850, acquisition 800, gain +50,00.
  // Help of the Modelo 100 of 2025, key 4: «cualesquiera otros bienes o
  // derechos no incluidos en los apartados anteriores».
  it("goes to 'otros elementos' with key 4, chosen by exclusion", () => {
    const boxes = taxBoxes(roundTrip("800", "1000", "1.25", "850", "1.1765").build(), 2025, {
      today: TODAY,
    });
    expect(
      ["1626", "1633", "1637", "1640", "1645", "1650", "0386"].map((box) => shown(boxes, box)),
    ).toEqual(["4", "850.00", "800.00", "50.00", "50.00", "50.00", "50.00"]);
    expect(codes(boxes)).toContain("tax_box_other_inferred");
    expect(codes(boxes)).not.toContain("tax_box_section_doubtful");
  });

  // Audit of 2026-11-03 (ronda 3, N2): 10.000 USD bought at 1,10
  // (9.090,91 €) and sold at 1,05 (9.523,81 €): +432,90 € to declare.
  it("declares the audit's example in 1640 and 0386", () => {
    const boxes = taxBoxes(roundTrip("9090.91", "10000", "1.10", "9523.81", "1.05").build(), 2025, {
      today: TODAY,
    });
    expect(["1640", "1650", "0386"].map((box) => shown(boxes, box))).toEqual([
      "432.90",
      "432.90",
      "432.90",
    ]);
  });

  // Key 2 and key 4 are rows of the same part of the form: one sum each way.
  it("adds both keys of 'otros elementos' into one 0385 and one 0386", () => {
    const b = roundTrip("800", "1000", "1.25", "850", "1.1765");
    b.asset("stock_us", { asset_type: "stock", transferable: false, market: "XNYS" });
    b.buy({
      account_id: "acc_us",
      asset_id: "stock_us",
      value_date: "2025-03-03",
      quantity: "10",
      unit_price: "100",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2025-03-03",
    });
    b.sell({
      account_id: "acc_us",
      asset_id: "stock_us",
      value_date: "2025-09-01",
      quantity: "10",
      unit_price: "80",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2025-09-01",
    });
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    const sums = (box: string) => boxes.entries.filter((item) => item.box === box);
    expect(sums("0385").map((item) => item.amount_eur?.centsText())).toEqual(["200.00"]);
    expect(sums("0386").map((item) => item.amount_eur?.centsText())).toEqual(["50.00"]);
    expect(boxes.entries.filter((item) => item.box === "1626").map((item) => item.text)).toEqual([
      "2",
      "4",
    ]);
  });
});
