// "Until when not to buy X back", worked out by hand.
//
// Art. 33.5.f) LIRPF: the loss of a listed security is not computed when
// homogeneous ones are acquired within the two months before or after; a fund
// takes the same window (criterion #2). Art. 33.5.e): direct crypto, the year
// after the sale. The window is counted date to date and its last day counts
// (criterion #14).

import { describe, expect, it } from "vitest";
import { Money } from "../../src/money/money.js";
import { planRepurchaseWarnings } from "../../src/tax/plan-repurchase.js";
import { repurchaseCalendar } from "../../src/tax/repurchase-calendar.js";
import { HAND_SETTINGS, taxBuilder } from "./helpers.js";

/** 10 units of a fund bought at 100 and sold at 80 on `sold`: a loss of 200. */
const lossOn = (sold: string) => {
  const b = taxBuilder(HAND_SETTINGS);
  b.buy({ account_id: "acc_a", asset_id: "fund_f", value_date: "2025-01-10" });
  b.sell({
    account_id: "acc_a",
    asset_id: "fund_f",
    quantity: "10",
    unit_price: "80",
    value_date: sold,
  });
  return b;
};

const view = (calendar: ReturnType<typeof repurchaseCalendar>) =>
  calendar.blocks.map((block) => [
    block.asset_id,
    block.until,
    block.at_stake_eur.centsText(),
    block.sales.map((sale) => [sale.fiscal_date, sale.until, sale.deferred_eur.centsText()]),
  ]);

describe("repurchaseCalendar", () => {
  it("blocks a fund for two months after a loss, the last day included", () => {
    // Sold 15/09/2026: two months date to date end on 15/11/2026, which still counts.
    const events = lossOn("2026-09-15").build();
    expect(view(repurchaseCalendar(events, "2026-10-01"))).toEqual([
      ["fund_f", "2026-11-15", "200.00", [["2026-09-15", "2026-11-15", "0.00"]]],
    ]);
    expect(repurchaseCalendar(events, "2026-11-15").blocks).toHaveLength(1);
    expect(repurchaseCalendar(events, "2026-11-16").blocks).toEqual([]);
    expect(repurchaseCalendar(events, "2026-10-01").transfer_in_counts).toBe(true);
  });

  it("keeps at stake only what a repurchase has not deferred yet", () => {
    // 5 of the 10 units bought back on 20/10/2026: 5/10 of the 200 is deferred
    // (art. 33.5.f, in proportion to the units), 100 is still at stake.
    const b = lossOn("2026-09-15");
    b.buy({ account_id: "acc_a", asset_id: "fund_f", quantity: "5", value_date: "2026-10-20" });
    expect(view(repurchaseCalendar(b.build(), "2026-10-25"))).toEqual([
      ["fund_f", "2026-11-15", "100.00", [["2026-09-15", "2026-11-15", "100.00"]]],
    ]);
  });

  it("reads the year before when the window crosses the new year", () => {
    // Sold 20/12/2025, consulted on 10/01/2026: open until 20/02/2026.
    const events = lossOn("2025-12-20").build();
    expect(view(repurchaseCalendar(events, "2026-01-10"))).toEqual([
      ["fund_f", "2026-02-20", "200.00", [["2025-12-20", "2026-02-20", "0.00"]]],
    ]);
  });

  it("blocks crypto for one year, and joins two sales of the same asset", () => {
    // 1 coin at 1,000 sold at 600 on 01/03/2026 (−400) and another at 900 on
    // 01/06/2026 (−100): open until 01/03/2027 and 01/06/2027 (art. 33.5.e).
    // A gain on the fund is never listed.
    const b = taxBuilder(HAND_SETTINGS);
    b.buy({
      account_id: "acc_a",
      asset_id: "coin_c",
      quantity: "2",
      unit_price: "1000",
      value_date: "2025-01-10",
    });
    b.sell({
      account_id: "acc_a",
      asset_id: "coin_c",
      quantity: "1",
      unit_price: "600",
      value_date: "2026-03-01",
    });
    b.sell({
      account_id: "acc_a",
      asset_id: "coin_c",
      quantity: "1",
      unit_price: "900",
      value_date: "2026-06-01",
    });
    b.buy({ account_id: "acc_a", asset_id: "fund_f", value_date: "2025-01-10" });
    b.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      unit_price: "120",
      value_date: "2026-05-04",
    });
    expect(view(repurchaseCalendar(b.build(), "2026-10-01"))).toEqual([
      [
        "coin_c",
        "2027-06-01",
        "500.00",
        [
          ["2026-03-01", "2027-03-01", "0.00"],
          ["2026-06-01", "2027-06-01", "0.00"],
        ],
      ],
    ]);
  });

  it("reaches as far back as a custom window in days", () => {
    // A window of 400 days for funds: sold 15/09/2025, open until 20/10/2026 (365 days to 15/09/2026, then 35 more).
    const b = taxBuilder({
      ...HAND_SETTINGS,
      wash_sale_window: { ...HAND_SETTINGS.wash_sale_window, fund: "400d" },
    });
    b.buy({ account_id: "acc_a", asset_id: "fund_f", value_date: "2024-01-10" });
    b.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      quantity: "10",
      unit_price: "80",
      value_date: "2025-09-15",
    });
    expect(repurchaseCalendar(b.build(), "2026-10-01").blocks.map((x) => x.until)).toEqual([
      "2026-10-20",
    ]);
  });

  it("orders by date and then by asset", () => {
    // fund_g and fund_f lose on the same day: same end, alphabetical order.
    const b = lossOn("2026-09-15");
    b.buy({ account_id: "acc_a", asset_id: "fund_g", value_date: "2025-01-10" });
    b.sell({
      account_id: "acc_a",
      asset_id: "fund_g",
      quantity: "10",
      unit_price: "90",
      value_date: "2026-09-15",
    });
    b.buy({ account_id: "acc_a", asset_id: "fund_h", value_date: "2025-01-10" });
    b.sell({
      account_id: "acc_a",
      asset_id: "fund_h",
      quantity: "10",
      unit_price: "90",
      value_date: "2026-08-14",
    });
    const blocks = repurchaseCalendar(b.build(), "2026-10-01").blocks;
    expect(blocks.map((x) => [x.asset_id, x.until])).toEqual([
      ["fund_h", "2026-10-14"],
      ["fund_f", "2026-11-15"],
      ["fund_g", "2026-11-15"],
    ]);
  });

  it("drops a sale whose loss a repurchase already deferred in full", () => {
    // All 10 units bought back on 20/10/2026: the 200 are deferred, nothing is left at stake.
    const b = lossOn("2026-09-15");
    b.buy({ account_id: "acc_a", asset_id: "fund_f", quantity: "10", value_date: "2026-10-20" });
    expect(repurchaseCalendar(b.build(), "2026-10-25").blocks).toEqual([]);
  });

  it("counts the loss a sale with a gain released", () => {
    // Sold at 80 on 02/03/2026 (−200), bought back at 80 on 10/03/2026: the 200
    // ride on the new lot. Sold at 110 on 01/09/2026: own gain +300 and the 200
    // released (#21), which a purchase until 01/11/2026 would defer again.
    const b = lossOn("2026-03-02");
    b.buy({
      account_id: "acc_a",
      asset_id: "fund_f",
      quantity: "10",
      unit_price: "80",
      value_date: "2026-03-10",
    });
    b.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      quantity: "10",
      unit_price: "110",
      value_date: "2026-09-01",
    });
    expect(view(repurchaseCalendar(b.build(), "2026-10-01"))).toEqual([
      ["fund_f", "2026-11-01", "200.00", [["2026-09-01", "2026-11-01", "0.00"]]],
    ]);
  });

  it("keeps two months for an ETC as movable capital, whatever the window set", () => {
    // Art. 25.2.b) LIRPF: two months for any financial asset; a window of one year
    // configured for ETCs does not apply. Sold 15/09/2026 at a loss → 15/11/2026.
    const b = taxBuilder({
      ...HAND_SETTINGS,
      income_category: { ...HAND_SETTINGS.income_category, etc: "movable_capital" },
      wash_sale_window: { ...HAND_SETTINGS.wash_sale_window, etc: "1y" },
    });
    b.buy({ account_id: "acc_a", asset_id: "etc_e", value_date: "2025-01-10" });
    b.sell({
      account_id: "acc_a",
      asset_id: "etc_e",
      quantity: "10",
      unit_price: "80",
      value_date: "2026-09-15",
    });
    expect(repurchaseCalendar(b.build(), "2026-10-01").blocks.map((x) => x.until)).toEqual([
      "2026-11-15",
    ]);
  });

  it("reads two years back for a custom window longer than a year", () => {
    // 400 days for funds: sold 20/12/2024, open until 24/01/2026 (365 days to
    // 20/12/2025, then 35 more), consulted on 10/01/2026.
    const b = taxBuilder({
      ...HAND_SETTINGS,
      wash_sale_window: { ...HAND_SETTINGS.wash_sale_window, fund: "400d" },
    });
    b.buy({ account_id: "acc_a", asset_id: "fund_f", value_date: "2024-01-10" });
    b.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      quantity: "10",
      unit_price: "80",
      value_date: "2024-12-20",
    });
    expect(repurchaseCalendar(b.build(), "2026-01-10").blocks.map((x) => x.until)).toEqual([
      "2026-01-24",
    ]);
  });
});

describe("planRepurchaseWarnings", () => {
  const plan = (rows: [string, string][]) => ({
    rows: rows.map(([asset_id, eur]) => ({ asset_id, allocation_eur: Money.parse(eur, "EUR") })),
  });

  it("warns a purchase of the plan inside the open window, and only that one", () => {
    // The loss of 200 of 15/09/2026 is open until 15/11/2026: a purchase of
    // fund_f would defer it; fund_g has no sale and nothing goes to fund_h.
    const events = lossOn("2026-09-15").build();
    const warnings = planRepurchaseWarnings(
      events,
      plan([
        ["fund_f", "300"],
        ["fund_g", "300"],
        ["fund_h", "0"],
      ]),
      "2026-10-01",
    );
    expect(
      warnings.map((entry) => [
        entry.asset_id,
        entry.sale_date,
        entry.until,
        entry.at_stake_eur.centsText(),
      ]),
    ).toEqual([["fund_f", "2026-09-15", "2026-11-15", "200.00"]]);
  });

  it("says nothing once the window is closed, or when the plan does not buy the asset", () => {
    const events = lossOn("2026-09-15").build();
    expect(planRepurchaseWarnings(events, plan([["fund_f", "300"]]), "2026-11-16")).toEqual([]);
    expect(planRepurchaseWarnings(events, plan([["fund_f", "0"]]), "2026-10-01")).toEqual([]);
  });
});
