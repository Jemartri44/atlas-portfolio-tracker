// The income tax return of **2025 laid out by box**, worked out by hand
// (feature 010, §6.4 of `specs/010-tax-output/questions.md`).
//
// The literals below are copied from that document, which was committed on
// 2026-09-19, **before a line of this code existed**: the history of git is the
// proof that the figures were not read off the output. Any discrepancy is
// investigated and written down there, and the literal is not touched until it
// is clear who was right.
//
// The configuration is written out in full, family by family and scalar by
// scalar: a hand calculation whose literals move when a default moves is a
// mirror of the engine and not a check on it. Two of the values it fixes are
// what the working depends on and are named in the document: **one year** for a
// fund, which is what makes the subscription of 05/05 defer half the loss of
// 03/03, and **two months** for a listed security, which is what leaves the
// purchase of 20/01 outside the window of the sale of 02/06.

import { describe, expect, it } from "vitest";
import type { Settings } from "../../src/settings/settings.js";
import { taxBoxes } from "../../src/tax/boxes/boxes.js";
import type { BoxEntry, TaxBoxes } from "../../src/tax/boxes/report.js";
import { LedgerBuilder } from "../ledger-builder.js";

/** Every value the engine reads, written out: nothing here rides a default. */
const SETTINGS: Settings = {
  fiscal_date_rule: {
    stock: "trade_date",
    etf: "trade_date",
    etc: "trade_date",
    etp: "trade_date",
    crypto: "trade_date",
    fund: "value_date",
    money_market: "value_date",
  },
  wash_sale_window: {
    stock: "2m",
    etf: "2m",
    etc: "2m",
    etp: "2m",
    crypto: "1y",
    fund: "1y",
    money_market: "1y",
  },
  income_category: {
    stock: "capital_gain",
    etf: "capital_gain",
    etc: "movable_capital",
    etp: "movable_capital",
    crypto: "capital_gain",
    fund: "capital_gain",
    money_market: "capital_gain",
  },
  wash_sale_transfer_counts: true,
  savings_offset_limit_pct: "25",
  loss_carryforward_years: 4,
  treaty_withholding_pct: { US: "15" },
};

const TODAY = "2026-09-18";

const ledger = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  b.settings(SETTINGS);
  b.account("acc_mi");
  b.account("acc_ib", { platform: "ibkr", country: "IE" });
  b.asset("fund_a");
  b.asset("etf_w", { asset_type: "etf", transferable: false });
  b.asset("stock_s", { asset_type: "stock", transferable: false });
  b.asset("stock_t", { asset_type: "stock", transferable: false });
  b.asset("coin_c", { asset_type: "crypto", asset_class: "crypto", transferable: false });
  b.asset("etc_g", { asset_type: "etc", asset_class: "gold", transferable: false });

  const buy = (account: string, asset: string, date: string, quantity: string, price: string) =>
    b.buy({ account_id: account, asset_id: asset, value_date: date, quantity, unit_price: price });
  const sell = (account: string, asset: string, date: string, quantity: string, price: string) =>
    b.sell({ account_id: account, asset_id: asset, value_date: date, quantity, unit_price: price });

  // 2024: a loss on stock_t deferred whole by the repurchase of 02/12.
  buy("acc_mi", "fund_a", "2024-01-10", "100", "10");
  buy("acc_ib", "stock_t", "2024-10-01", "10", "100");
  sell("acc_ib", "stock_t", "2024-11-04", "10", "80");
  buy("acc_ib", "stock_t", "2024-12-02", "10", "85");
  // The return of 2024, filed with a pending loss of 2023 from before the
  // application and the −200,00 still deferred.
  b.filed({
    tax_year: 2024,
    filed_at: "2025-06-20",
    declared: {
      savings_base_eur: "0",
      pending_losses: [{ origin_year: 2023, category: "capital_gain", amount_eur: "-300" }],
      deferred_losses_eur: "-200",
    },
  });

  // 2025.
  buy("acc_ib", "etf_w", "2025-01-15", "10", "100");
  buy("acc_ib", "stock_s", "2025-01-20", "10", "50");
  sell("acc_ib", "stock_t", "2025-02-03", "10", "95");
  buy("acc_ib", "coin_c", "2025-02-10", "1", "1000");
  b.sell({
    account_id: "acc_mi",
    asset_id: "fund_a",
    value_date: "2025-03-03",
    quantity: "40",
    unit_price: "9",
  });
  buy("acc_ib", "etc_g", "2025-03-10", "5", "200");
  buy("acc_mi", "fund_a", "2025-05-05", "20", "9.5");
  b.dividend({
    account_id: "acc_ib",
    asset_id: "stock_s",
    value_date: "2025-05-15",
    gross: "50",
    withholding_origin: "7.5",
    currency: "USD",
    fx_rate: "1.25",
    fx_rate_date: "2025-05-15",
    source_country: "US",
  });
  sell("acc_ib", "stock_s", "2025-06-02", "10", "45");
  sell("acc_ib", "etf_w", "2025-09-01", "10", "120");
  sell("acc_ib", "etc_g", "2025-10-01", "5", "190");
  b.sell({
    account_id: "acc_mi",
    asset_id: "fund_a",
    value_date: "2025-11-10",
    quantity: "60",
    unit_price: "11",
    withholding: "11.40",
  });
  sell("acc_ib", "coin_c", "2025-12-01", "1", "1300");
  b.fee({
    account_id: "acc_ib",
    value_date: "2025-12-15",
    amount: "10",
    description: "custodia",
    fee_kind: "custody",
  });
  b.interest({
    account_id: "acc_mi",
    value_date: "2025-12-31",
    gross: "100",
    withholding_spain: "19",
  });
  return b;
};

/**
 * **On the signs below**: every amount carries its own, also where the form
 * resolves it by sending the figure to a second box (0424/0425, 0429/0430).
 * The magnitudes are the ones worked out by hand and have not moved; what
 * changed on 2026-09-23 is that a loss now reads as a loss, because in a year
 * with no checked table —which is every year but this one— there is no box
 * number beside it to say so.
 */
/** The amount of a box, as two decimals, the way the user types it. */
const box = (boxes: TaxBoxes, number: string, row?: string): string => {
  const found = boxes.entries.filter(
    (entry) => entry.box === number && (row === undefined || entry.row?.event_id === row),
  );
  if (found.length !== 1) {
    throw new Error(`expected one entry for box ${number}, found ${found.length}`);
  }
  const entry = found[0] as BoxEntry;
  if (entry.amount_eur === undefined) {
    return entry.missing === true ? "falta" : "sin importe";
  }
  const [whole, fraction = ""] = entry.amount_eur.amount.toString().split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
};

const entryOf = (boxes: TaxBoxes, number: string): BoxEntry =>
  boxes.entries.find((entry) => entry.box === number) as BoxEntry;

describe("the 2025 return by box, worked out by hand", () => {
  const b = ledger();
  const events = b.build();
  const boxes = taxBoxes(events, 2025, { today: TODAY });
  const at = (date: string): string =>
    (
      events.find((event) => (event as { value_date?: string }).value_date === date) as {
        id: string;
      }
    ).id;

  it("lays the collective investment undertakings out, one row per redemption", () => {
    // 03/03: 40 at 9,00 against 40 of the lot of 2024 at 10,00. −40,00, of
    // which the subscription of 05/05 defers 20/40: imputable −20,00.
    expect(box(boxes, "0312", at("2025-03-03"))).toBe("360.00");
    expect(box(boxes, "0315", at("2025-03-03"))).toBe("400.00");
    expect(box(boxes, "0321", at("2025-03-03"))).toBe("-40.00");
    expect(box(boxes, "0322", at("2025-03-03"))).toBe("-20.00");
    // The NIF of the fund is not in the ledger and is not invented.
    expect(box(boxes, "0311", at("2025-03-03"))).toBe("falta");
    // 10/11: 60 at 11,00 against the 60 left of the lot of 2024. +60,00.
    expect(box(boxes, "0312", at("2025-11-10"))).toBe("660.00");
    expect(box(boxes, "0315", at("2025-11-10"))).toBe("600.00");
    expect(box(boxes, "0316", at("2025-11-10"))).toBe("60.00");
    expect(box(boxes, "0320", at("2025-11-10"))).toBe("60.00");
    expect(box(boxes, "0324")).toBe("60.00");
    expect(box(boxes, "0325")).toBe("-20.00");
  });

  it("lays the ETF out in the section of its own that 2025 created", () => {
    expect(box(boxes, "2227")).toBe("1200.00");
    expect(box(boxes, "2229")).toBe("1000.00");
    expect(box(boxes, "2230")).toBe("200.00");
    expect(box(boxes, "2232")).toBe("200.00");
    expect(box(boxes, "2235")).toBe("200.00");
    expect(box(boxes, "2236")).toBe("0.00");
    expect(box(boxes, "2225")).toBe("falta");
    // The section is the one of article 75.3.j), new in 2025: never the
    // general one of collective investment undertakings.
    expect(entryOf(boxes, "2235").label).toContain("artículo 75.3.j)");
  });

  it("lays the shares out, the gain of one and the loss of the other", () => {
    expect(box(boxes, "0328", at("2025-06-02"))).toBe("450.00");
    expect(box(boxes, "0331", at("2025-06-02"))).toBe("500.00");
    expect(box(boxes, "0337", at("2025-06-02"))).toBe("-50.00");
    expect(box(boxes, "0338", at("2025-06-02"))).toBe("-50.00");
    // 03/02 is a **gain** of 100,00 on the form: what it released belongs to
    // the loss of 2024 and is declared there (ficha F5).
    expect(box(boxes, "0328", at("2025-02-03"))).toBe("950.00");
    expect(box(boxes, "0331", at("2025-02-03"))).toBe("850.00");
    expect(box(boxes, "0332", at("2025-02-03"))).toBe("100.00");
    expect(box(boxes, "0336", at("2025-02-03"))).toBe("100.00");
    expect(box(boxes, "0339")).toBe("100.00");
    expect(box(boxes, "0340")).toBe("-50.00");
  });

  it("lays the virtual currency out", () => {
    expect(box(boxes, "1804")).toBe("1300.00");
    expect(box(boxes, "1806")).toBe("1000.00");
    expect(box(boxes, "1809")).toBe("300.00");
    expect(box(boxes, "1811")).toBe("300.00");
    expect(box(boxes, "1812")).toBe("300.00");
    expect(box(boxes, "1813")).toBe("0.00");
    expect(box(boxes, "1814")).toBe("300.00");
  });

  it("takes the loss of 2024 released this year to the section of earlier years", () => {
    expect(box(boxes, "0395")).toBe("-200.00");
    expect(box(boxes, "0396")).toBe("-200.00");
    // It is named by the operation that produced it, in 2024, not by the one
    // that released it.
    expect(entryOf(boxes, "0395").row?.fiscal_date).toBe("2024-11-04");
    expect(entryOf(boxes, "0395").origin_year).toBe(2024);
  });

  it("adds the capital gains up to the balance the engine computes", () => {
    expect(box(boxes, "0422")).toBe("660.00");
    expect(box(boxes, "0423")).toBe("-270.00");
    expect(box(boxes, "0424")).toBe("390.00");
  });

  it("puts the ETC in movable capital income, with its minus sign", () => {
    expect(box(boxes, "0027")).toBe("100.00");
    expect(box(boxes, "0029")).toBe("40.00");
    // Box 0031 is the one the form asks for with a sign.
    expect(box(boxes, "0031", at("2025-10-01"))).toBe("-50.00");
    expect(box(boxes, "0036")).toBe("90.00");
    expect(box(boxes, "0037")).toBe("-10.00");
    expect(box(boxes, "0038")).toBe("80.00");
    expect(box(boxes, "0040")).toBe("80.00");
    expect(box(boxes, "0041")).toBe("80.00");
    expect(box(boxes, "0429")).toBe("80.00");
  });

  it("offsets the pending loss of 2023 in the box of its origin year", () => {
    expect(box(boxes, "0441")).toBe("300.00");
    expect(entryOf(boxes, "0441").origin_year).toBe(2023);
    // Annex C.3, the same origin year: what it had, what it applies, what is left.
    expect(box(boxes, "1264")).toBe("-300.00");
    expect(box(boxes, "1265")).toBe("-300.00");
    expect(box(boxes, "1266")).toBe("0.00");
  });

  it("gives the base of the savings, and says what it cannot compute", () => {
    expect(box(boxes, "0460")).toBe("170.00");
    // 0510 is 0460 less two remainders of reductions the ledger cannot see.
    expect(box(boxes, "0510")).toBe("sin importe");
    expect(entryOf(boxes, "0510").partial).toBe("reductions_unknown");
    // The double taxation deduction is the lesser of two limits and the engine
    // knows the first: it is given as the first limit, never as the box.
    const limit = boxes.entries.find((entry) => entry.concept === "ddi.first_limit") as BoxEntry;
    expect(limit.amount_eur?.amount.toString()).toBe("6");
    expect(limit.box).toBeUndefined();
    expect(box(boxes, "0588")).toBe("sin importe");
    expect(box(boxes, "0597")).toBe("19.00");
    expect(box(boxes, "0603")).toBe("11.40");
  });

  it("carries the source of every box it gives, and the day it was checked", () => {
    const entry = entryOf(boxes, "0460");
    expect(boxes.mapping).toBe("checked");
    expect(entry.certainty).toBe("high");
    expect(entry.checked_at).toBe("2026-09-23");
    expect(entry.source?.document).toContain("Orden HAC/277/2026");
    expect(entry.source?.url).toBe(
      "https://www.boe.es/datos/imagenes/disp/2026/76/7041_16815484_19.png",
    );
    expect(entry.label).toContain("Base imponible del ahorro");
  });

  it("gives the same ledger in 2024 by concept and with no box at all", () => {
    const before = taxBoxes(events, 2024, { today: TODAY });
    expect(before.mapping).toBe("none");
    expect(before.entries.every((entry) => entry.box === undefined)).toBe(true);
    expect(before.entries.every((entry) => entry.source === undefined)).toBe(true);
    expect(before.notes.map((n) => n.code)).toContain("tax_boxes_missing_year");
    // The figures are still there: the base of 2024 is 0,00 and the loss of
    // stock_t is deferred whole.
    const base = before.entries.find((entry) => entry.concept === "base.savings") as BoxEntry;
    expect(base.amount_eur?.amount.toString()).toBe("0");
    const imputable = before.entries.find(
      (entry) => entry.concept === "gp.listed_shares.loss_imputable",
    ) as BoxEntry;
    expect(imputable.amount_eur?.amount.toString()).toBe("0");
  });
});
