// The wash-sale rule, computed (feature 009): the mandatory edge cases of the
// prompt §5 and of constitution VII, one test each, with its name.

import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { walkWashSales } from "../../src/tax/wash-sale.js";
import { buy, lineOf, reportOf, sell, taxBuilder, text, transfer } from "./helpers.js";

describe("the window, counted date to date, at its four edges", () => {
  const windowCase = (
    asset: string,
    saleDate: string,
    buyDate: string,
    window?: string,
  ): string => {
    const b = taxBuilder(
      window === undefined
        ? DEFAULT_SETTINGS
        : {
            ...DEFAULT_SETTINGS,
            wash_sale_window: { ...DEFAULT_SETTINGS.wash_sale_window, fund: window as "1y" },
          },
    );
    buy(b, asset, "2026-01-05", "10", "100");
    const loss = sell(b, asset, saleDate, "5", "80");
    buy(b, asset, buyDate, "5", "80");
    const line = lineOf(reportOf(b.build(), Number(saleDate.slice(0, 4))), loss.id);
    return text(line.deferred_eur.roundToCents());
  };

  it("two months: a purchase exactly two months after defers, the day after does not", () => {
    expect(windowCase("stock_s", "2027-03-15", "2027-05-15")).toBe("-100");
    expect(windowCase("stock_s", "2027-03-15", "2027-05-16")).toBe("0");
  });

  it("two months: exactly two months before defers, the day before does not", () => {
    // Only the units still held count (#18): buy 5 more before the sale of 5.
    const before = (buyDate: string): string => {
      const b = taxBuilder();
      buy(b, "stock_s", "2026-01-05", "5", "100");
      buy(b, "stock_s", buyDate, "5", "100");
      const loss = sell(b, "stock_s", "2027-03-15", "5", "80");
      return text(lineOf(reportOf(b.build(), 2027), loss.id).deferred_eur.roundToCents());
    };
    expect(before("2027-01-15")).toBe("-100");
    expect(before("2027-01-14")).toBe("0");
  });

  it("two months at the end of a month: 31 March minus two months is 31 January, plus two is 31 May", () => {
    expect(windowCase("stock_s", "2027-03-31", "2027-05-31")).toBe("-100");
    expect(windowCase("stock_s", "2027-03-31", "2027-06-01")).toBe("0");
  });

  /**
   * The year is no longer the default of a fund (criterion #2, corrected on
   * 2026-09-22), so the ledger says so: what this pins is the **arithmetic of
   * a year from a 29 February**, not which asset takes a year.
   */
  it("one year, from 29 February: the window ends on 28 February", () => {
    expect(windowCase("fund_f", "2028-02-29", "2029-02-28", "1y")).toBe("-100");
    expect(windowCase("fund_f", "2028-02-29", "2029-03-01", "1y")).toBe("0");
  });

  it("two months for a fund, which is its default: 29 February plus two is 29 April", () => {
    expect(windowCase("fund_f", "2028-02-29", "2028-04-29")).toBe("-100");
    expect(windowCase("fund_f", "2028-02-29", "2028-04-30")).toBe("0");
  });
});

describe("mandatory edge cases", () => {
  it("several lots with the same date: FIFO by position, and the deferral too", () => {
    const b = taxBuilder();
    const first = buy(b, "stock_s", "2027-01-11", "3", "100");
    const second = buy(b, "stock_s", "2027-01-11", "3", "110");
    const loss = sell(b, "stock_s", "2027-06-01", "4", "50");
    const r1 = buy(b, "stock_s", "2027-06-10", "1", "50");
    const r2 = buy(b, "stock_s", "2027-06-10", "1", "50");
    const line = lineOf(reportOf(b.build(), 2027), loss.id);
    expect(line.lots.map((lot) => [lot.lineage[0]?.event_id, lot.quantity.toString()])).toEqual([
      [first.id, "3"],
      [second.id, "1"],
    ]);
    // Cost 300 + 110 = 410, proceeds 200: −210; 2 of 4 units repurchased.
    expect(text(line.deferred_eur.roundToCents())).toBe("-105");
    expect(line.deferral?.acquisitions.map((a) => [a.event_id, text(a.amount_eur)])).toEqual([
      [r1.id, "-52.5"],
      [r2.id, "-52.5"],
    ]);
  });

  it("fractions: six decimals throughout, and the deferral adds up exactly", () => {
    const b = taxBuilder();
    buy(b, "fund_f", "2025-12-01", "1.123456", "100");
    const loss = sell(b, "fund_f", "2027-06-01", "0.5", "90");
    const again = buy(b, "fund_f", "2027-07-01", "0.123456", "95");
    const later = sell(b, "fund_f", "2027-12-01", "0.746912", "96");
    const report = reportOf(b.build(), 2027);
    const line = lineOf(report, loss.id);
    // Loss 0.5 × (90 − 100) = −5; deferred 5 × 0.123456 / 0.5.
    expect(text(line.deferred_eur)).toBe("-1.23456");
    expect(line.deferral?.acquisitions.map((a) => a.event_id)).toEqual([again.id]);
    const release = lineOf(report, later.id);
    expect(text(release.released_eur)).toBe("-1.23456");
    expect(report.wash_sale.pending).toEqual([]);
  });

  it("reverse split with cash in lieu in two accounts: each account is a transmission, each unit repurchased defers once", () => {
    const b = taxBuilder();
    b.buy({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2027-01-11",
      quantity: "10",
      unit_price: "100",
    });
    b.buy({
      account_id: "acc_b",
      asset_id: "stock_s",
      value_date: "2027-01-12",
      quantity: "7",
      unit_price: "100",
    });
    const action = b.corporateAction({
      kind: "reverse_split",
      asset_id: "stock_s",
      effective_date: "2027-06-01",
      effects: [
        { op: "scale", ratio: "1/4" },
        {
          op: "forced_sale",
          per_account: [
            { account_id: "acc_a", quantity: "0.5" },
            { account_id: "acc_b", quantity: "0.75" },
          ],
          unit_price: "200",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-06-01",
        },
      ],
    });
    buy(b, "stock_s", "2027-06-15", "1", "200");
    const report = reportOf(b.build(), 2027);
    const a = lineOf(report, action.id, "acc_a");
    const bb = lineOf(report, action.id, "acc_b");
    // After the scale, a unit costs 400: 0.5 sold at 200 loses 100; 0.75 loses 150.
    expect([text(a.own_eur.roundToCents()), text(bb.own_eur.roundToCents())]).toEqual([
      "-100",
      "-150",
    ]);
    // One unit repurchased: 0.5 for the first loss (all of it), 0.5 for the second (#19).
    expect(text(a.deferred_eur)).toBe("-100");
    expect(text(bb.deferred_eur.roundToCents())).toBe("-100");
    expect(bb.criteria).toContain("19");
    expect(a.event_type).toBe("forced_sale");
    expect(a.corporate_action_kind).toBe("reverse_split");
  });

  it("partial transfer of the lot carrying a deferral: only the part transferred travels", () => {
    const b = taxBuilder();
    buy(b, "fund_f", "2027-01-11", "10", "100");
    const loss = sell(b, "fund_f", "2027-03-01", "10", "90");
    buy(b, "fund_f", "2027-04-01", "10", "90");
    transfer(b, "fund_f", "fund_g", "2027-05-03", "4", "8");
    const saleG = sell(b, "fund_g", "2027-09-01", "8", "46");
    const saleF = sell(b, "fund_f", "2027-10-01", "6", "92");
    const report = reportOf(b.build(), 2027);
    expect(text(lineOf(report, loss.id).deferred_eur)).toBe("-100");
    expect(lineOf(report, saleG.id).released.map((r) => [text(r.amount_eur), r.travelled])).toEqual(
      [["-40", true]],
    );
    expect(lineOf(report, saleF.id).released.map((r) => [text(r.amount_eur), r.travelled])).toEqual(
      [["-60", false]],
    );
    expect(lineOf(report, saleG.id).criteria).toContain("15");
  });

  it("a partial transfer then a spin-off of the origin: what travelled is not carved out again", () => {
    const b = taxBuilder();
    buy(b, "fund_f", "2027-01-11", "10", "100");
    const loss = sell(b, "fund_f", "2027-02-01", "10", "90");
    buy(b, "fund_f", "2027-03-01", "10", "90");
    // 4 of the 10 units carrying the −100 move to fund_g: −40 travel with them.
    transfer(b, "fund_f", "fund_g", "2027-03-15", "4", "4");
    // Then the origin lot gives 30 % of its cost to fund_h: 30 % of the −60 left.
    b.corporateAction({
      kind: "spin_off",
      asset_id: "fund_f",
      effective_date: "2027-04-01",
      effects: [{ op: "carve_out", to_asset_id: "fund_h", ratio: "1", cost_share: "0.3" }],
    });
    const report = reportOf(b.build(), 2027);
    expect(text(lineOf(report, loss.id).deferred_eur)).toBe("-100");
    // Still −100 in all: the −40 in transit went to fund_g once, not to fund_h too.
    expect(
      report.wash_sale.pending.map((p) => [p.asset_id, text(p.amount_eur), p.travelled]),
    ).toEqual([
      ["fund_f", "-42", false],
      ["fund_g", "-40", true],
      ["fund_h", "-18", true],
    ]);
  });

  it("a transfer keeps the antiquity through three hops, and the deferral travels with it", () => {
    const b = taxBuilder();
    buy(b, "fund_f", "2027-01-11", "10", "100");
    const loss = sell(b, "fund_f", "2027-02-01", "10", "90");
    const again = buy(b, "fund_f", "2027-03-01", "10", "90");
    const first = transfer(b, "fund_f", "fund_g", "2027-04-01", "10", "20");
    const second = transfer(b, "fund_g", "fund_h", "2027-05-03", "20", "20");
    const last = transfer(b, "fund_h", "fund_i", "2027-06-01", "20", "10");
    const sale = sell(b, "fund_i", "2028-06-01", "10", "95");
    const report = reportOf(b.build(), 2028);
    const line = lineOf(report, sale.id);
    expect(text(lineOf(reportOf(b.build(), 2027), loss.id).deferred_eur)).toBe("-100");
    expect(line.lots[0]?.acquisition_date).toBe("2027-03-01");
    // Every hop, newest first, down to the repurchase that carried the deferral.
    expect(line.lots[0]?.lineage.map((step) => step.event_id)).toEqual([
      last.id,
      second.id,
      first.id,
      again.id,
    ]);
    expect(line.lots[0]?.root.event_id).toBe(again.id);
    // Own: 950 − 900 = 50; released −100: the year sees −50.
    expect(text(line.own_eur.roundToCents())).toBe("50");
    expect(text(line.computable_eur_rounded)).toBe("-50");
    expect(line.released.map((r) => r.travelled)).toEqual([true]);
  });

  it("a deferred loss whose lots are converted or carved out before release follows them, by cost share", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const loss = sell(b, "stock_s", "2027-02-01", "10", "90");
    buy(b, "stock_s", "2027-03-01", "10", "90");
    b.corporateAction({
      kind: "spin_off",
      asset_id: "stock_s",
      effective_date: "2027-04-01",
      effects: [{ op: "carve_out", to_asset_id: "stock_t", ratio: "1", cost_share: "0.3" }],
    });
    const saleT = sell(b, "stock_t", "2027-06-01", "10", "30");
    const saleS = sell(b, "stock_s", "2027-07-01", "10", "70");
    const report = reportOf(b.build(), 2027);
    expect(text(lineOf(report, loss.id).deferred_eur)).toBe("-100");
    expect(text(lineOf(report, saleT.id).released_eur)).toBe("-30");
    expect(text(lineOf(report, saleS.id).released_eur)).toBe("-70");
    expect(lineOf(report, saleT.id).criteria).toEqual(expect.arrayContaining(["7", "15"]));
  });

  /**
   * The mandatory edge case of constitution VII, now under the two windows: the
   * default of a fund is two months since the correction of criterion #2, and
   * the case is worth pinning under both, because which contributions fall
   * inside is exactly what the change moves.
   */
  it("a fund loss followed by the monthly contribution: the nearest purchases inside the window carry it", () => {
    const monthly = (window?: "1y") => {
      const b = taxBuilder(
        window === undefined
          ? DEFAULT_SETTINGS
          : {
              ...DEFAULT_SETTINGS,
              wash_sale_window: { ...DEFAULT_SETTINGS.wash_sale_window, fund: window },
            },
      );
      buy(b, "fund_f", "2027-01-11", "100", "10");
      const loss = sell(b, "fund_f", "2027-03-01", "100", "8");
      const months = ["2027-03-10", "2027-04-12", "2027-05-10"].map((date) =>
        buy(b, "fund_f", date, "40", "8"),
      );
      return { line: lineOf(reportOf(b.build(), 2027), loss.id), months };
    };
    // Two months, [01/01/2027, 01/05/2027]: the contribution of 10 May is out.
    const twoMonths = monthly();
    expect(text(twoMonths.line.deferred_eur)).toBe("-160");
    expect(
      twoMonths.line.deferral?.acquisitions.map((a) => [a.event_id, a.units.toString()]),
    ).toEqual([
      [twoMonths.months[0]?.id, "40"],
      [twoMonths.months[1]?.id, "40"],
    ]);
    // A year: the three of them, and only 100 of the 120 units are needed.
    const year = monthly("1y");
    expect(text(year.line.deferred_eur)).toBe("-200");
    expect(year.line.deferral?.acquisitions.map((a) => [a.event_id, a.units.toString()])).toEqual([
      [year.months[0]?.id, "40"],
      [year.months[1]?.id, "40"],
      [year.months[2]?.id, "20"],
    ]);
  });

  it("#18: a purchase inside the window that the loss-making sale itself consumed does not count", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2026-10-01", "5", "100");
    buy(b, "stock_s", "2027-02-15", "5", "100");
    const loss = sell(b, "stock_s", "2027-03-01", "10", "80");
    const report = reportOf(b.build(), 2027);
    const line = lineOf(report, loss.id);
    expect(text(line.deferred_eur)).toBe("0");
    expect(line.criteria).toContain("18");
    // The other reading would count the 5 units of the second buy, but the sale
    // left nothing of the asset to carry a deferral: it defers nothing more
    // (direction's decision after the fiscal review), and says so.
    const doubtful = report.doubtful.find((entry) => entry.criterion === "18");
    expect(text(doubtful?.base_difference_eur)).toBe("0");
    expect(doubtful?.reason).toBe("no_carrier_left");
    expect(doubtful?.direction).toBe("none");
  });

  it("#18 read the other way defers only onto units still held that the rule does not use", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    // Free shares: a lot that stays, and that is not an acquisition for the rule.
    b.corporateAction({
      kind: "stock_dividend",
      asset_id: "stock_s",
      effective_date: "2027-02-01",
      effects: [
        {
          op: "grant",
          per_account: [{ account_id: "acc_a", quantity: "5" }],
          unit_cost: "0",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-02-01",
          acquisition_date: "2027-02-01",
        },
      ],
    });
    const loss = sell(b, "stock_s", "2027-03-01", "10", "80");
    const report = reportOf(b.build(), 2027);
    expect(text(lineOf(report, loss.id).deferred_eur)).toBe("0");
    // −200 in all; the other reading could put 5 of the 10 units on the free shares.
    const doubtful = report.doubtful.find((entry) => entry.criterion === "18");
    expect(text(doubtful?.base_difference_eur)).toBe("100");
    expect(doubtful?.reason).toBeUndefined();
    expect(doubtful?.direction).toBe("aggressive");
  });

  it("#19: one repurchase in the windows of two losses defers only the first", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "20", "100");
    const first = sell(b, "stock_s", "2027-03-01", "10", "80");
    buy(b, "stock_s", "2027-03-05", "10", "80");
    const second = sell(b, "stock_s", "2027-03-10", "10", "80");
    const report = reportOf(b.build(), 2027);
    expect(text(lineOf(report, first.id).deferred_eur)).toBe("-200");
    expect(text(lineOf(report, second.id).deferred_eur)).toBe("0");
    expect(lineOf(report, second.id).criteria).toContain("19");
    // The criterion is still named on the line, and it is **not** doubtful: the
    // binding ruling V3282-18 resolves this very question, so the report does
    // not offer an alternative reading of it (certainty high, feature 009 Q8).
    expect(report.doubtful.map((entry) => entry.criterion)).not.toContain("19");
  });

  it("#19: a repurchase bought before two losses defers only the first, whichever buy carries it", () => {
    // Two prior purchases, and the second loss consumes what is left of the
    // first one: the purchase of February can only carry one of the two.
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "20", "100");
    buy(b, "stock_s", "2027-02-15", "10", "100");
    const first = sell(b, "stock_s", "2027-03-01", "10", "80");
    const second = sell(b, "stock_s", "2027-03-10", "10", "80");
    const report = reportOf(b.build(), 2027);
    expect(text(lineOf(report, first.id).deferred_eur)).toBe("-200");
    expect(text(lineOf(report, second.id).deferred_eur)).toBe("0");
    expect(text(lineOf(report, second.id).computable_eur_rounded)).toBe("-200");
    expect(report.wash_sale.pending.map((p) => text(p.amount_eur))).toEqual(["-200"]);
  });

  it("#20: a transmission of lots with results of different sign is looked at as a whole", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "5", "50");
    buy(b, "stock_s", "2027-01-12", "5", "150");
    const sale = sell(b, "stock_s", "2027-06-01", "10", "95");
    buy(b, "stock_s", "2027-06-10", "10", "95");
    const report = reportOf(b.build(), 2027);
    const line = lineOf(report, sale.id);
    // +225 on the first lot, −275 on the second: −50 net, all of it deferred.
    expect(text(line.own_eur.roundToCents())).toBe("-50");
    expect(text(line.deferred_eur)).toBe("-50");
    expect(line.criteria).toContain("20");
    expect(text(report.doubtful.find((e) => e.criterion === "20")?.exposure_eur)).toBe("275");
  });

  it("#21: a release that turns a gain into a loss is deferred again when there is a repurchase", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-02-01", "10", "90");
    buy(b, "stock_s", "2027-02-10", "10", "90");
    const gain = sell(b, "stock_s", "2027-06-01", "10", "95");
    buy(b, "stock_s", "2027-06-15", "10", "95");
    const line = lineOf(reportOf(b.build(), 2027), gain.id);
    // Own +50, released −100, total −50, repurchased all: deferred −50.
    expect(text(line.own_eur.add(line.released_eur).roundToCents())).toBe("-50");
    expect(text(line.deferred_eur)).toBe("-50");
    expect(line.criteria).toContain("21");
  });

  describe("a split between the loss and the repurchase: the same security, in other units", () => {
    /**
     * 20 bought long before the window, 10 sold at a loss of 200, `ratio`
     * applied, `bought` bought again: only the repurchase can defer.
     */
    const across = (ratio: string, bought: string) => {
      const b = taxBuilder();
      buy(b, "stock_s", "2026-10-01", "20", "100");
      const loss = sell(b, "stock_s", "2027-03-01", "10", "80");
      b.corporateAction({
        kind: ratio.startsWith("1/") ? "reverse_split" : "split",
        asset_id: "stock_s",
        effective_date: "2027-03-10",
        effects: [{ op: "scale", ratio }],
      });
      const again = buy(b, "stock_s", "2027-03-20", bought, "40");
      return { b, loss, again };
    };

    it("converts what was bought after a 2:1 split: 20 new shares are the 10 sold", () => {
      // The verifier's case: it used to be −200 computable, with only a note.
      const { b, loss, again } = across("2", "20");
      // The 10 left of the first buy became 20 and are sold first (FIFO); the
      // 20 bought again go with them.
      const later = sell(b, "stock_s", "2027-09-01", "40", "45");
      const report = reportOf(b.build(), 2027);
      const line = lineOf(report, loss.id);
      expect(text(line.deferred_eur)).toBe("-200");
      expect(text(line.computable_eur_rounded)).toBe("0");
      const deferral = report.wash_sale.deferred.find((d) => d.event_id === loss.id);
      // "10 de 10" in the units of the sale; the purchase in its own: 20.
      expect([deferral?.units.toString(), deferral?.sold.toString()]).toEqual(["10", "10"]);
      expect(deferral?.acquisitions.map((a) => [a.event_id, a.units.toString(), a.timing])).toEqual(
        [[again.id, "20", "posterior"]],
      );
      expect(report.notes.map((n) => n.code)).not.toContain("tax_scale_in_window");
      // And it comes back when those shares are sold.
      expect(text(lineOf(report, later.id).released_eur)).toBe("-200");
    });

    it("takes from a larger repurchase only what the sale needs, in its own units", () => {
      // 30 new shares are 15 of those sold; the 10 sold need 20 of them.
      const { b, loss, again } = across("2", "30");
      const report = reportOf(b.build(), 2027);
      expect(text(lineOf(report, loss.id).deferred_eur)).toBe("-200");
      const deferral = report.wash_sale.deferred.find((d) => d.event_id === loss.id);
      expect(deferral?.acquisitions.map((a) => [a.event_id, a.units.toString()])).toEqual([
        [again.id, "20"],
      ]);
    });

    it("converts across a 3:1 split: 15 new shares are 5 of those sold", () => {
      const { b, loss } = across("3", "15");
      const line = lineOf(reportOf(b.build(), 2027), loss.id);
      expect(text(line.deferred_eur)).toBe("-100");
      expect(text(line.computable_eur_rounded)).toBe("-100");
    });

    it("converts across a 1:4 reverse split: 2 new shares are 8 of those sold", () => {
      const { b, loss, again } = across("1/4", "2");
      const report = reportOf(b.build(), 2027);
      expect(text(lineOf(report, loss.id).deferred_eur)).toBe("-160");
      const deferral = report.wash_sale.deferred.find((d) => d.event_id === loss.id);
      expect(deferral?.units.toString()).toBe("8");
      expect(deferral?.acquisitions.map((a) => [a.event_id, a.units.toString()])).toEqual([
        [again.id, "2"],
      ]);
    });

    it("chains every split in between: a 3:2 and a 1:4 make 12 new shares 32 of those sold", () => {
      // The verifier's case, worked out by hand. 60 bought long before; 30 sold
      // at 80: −600. 3:2 and then 1:4: the 30 left are 11.25. 12 bought again
      // at 300 are 12 ÷ (3/2 × 1/4) = 32 of those sold: the −600 is deferred
      // whole, on 11.25 of the 12 new shares.
      const b = taxBuilder();
      buy(b, "stock_s", "2026-12-01", "60", "100");
      const first = sell(b, "stock_s", "2027-04-01", "30", "80");
      b.corporateAction({
        kind: "split",
        asset_id: "stock_s",
        effective_date: "2027-04-10",
        effects: [{ op: "scale", ratio: "3/2" }],
      });
      b.corporateAction({
        kind: "reverse_split",
        asset_id: "stock_s",
        effective_date: "2027-04-20",
        effects: [{ op: "scale", ratio: "1/4" }],
      });
      buy(b, "stock_s", "2027-05-03", "12", "300");
      // The 11.25 old ones at 200: 2,250 against 3,000, −750. Of the 12 new
      // shares only 0.75 are free (#19): −750 × 0.75 / 11.25 = −50 deferred.
      const second = sell(b, "stock_s", "2027-06-01", "11.25", "200");
      // The 12 new ones at 300: no result of their own, and −600 − 50 released.
      const last = sell(b, "stock_s", "2027-09-01", "12", "300");
      const report = reportOf(b.build(), 2027);
      const figures = (id: string) => {
        const line = lineOf(report, id);
        return [
          text(line.deferred_eur),
          text(line.released_eur),
          text(line.computable_eur_rounded),
        ];
      };
      expect(figures(first.id)).toEqual(["-600", "0", "0"]);
      expect(figures(second.id)).toEqual(["-50", "0", "-700"]);
      expect(figures(last.id)).toEqual(["0", "-650", "-650"]);
      expect(text(report.capital_gains.balance_eur)).toBe("-1350");
    });

    it("converts across a reverse split of an asset nobody held when it happened", () => {
      // Sold whole at a loss, a 1:4 reverse split while holding nothing, and a
      // repurchase inside the window. The split used to be unrecordable
      // (`no_open_lots`), and the engine compared 2.5 new shares with 10 old
      // ones: −50 deferred instead of −200.
      const b = taxBuilder();
      buy(b, "stock_s", "2026-10-01", "10", "100");
      const loss = sell(b, "stock_s", "2027-03-01", "10", "80");
      const split = b.corporateAction({
        kind: "reverse_split",
        asset_id: "stock_s",
        effective_date: "2027-03-10",
        effects: [{ op: "scale", ratio: "1/4" }],
      });
      buy(b, "stock_s", "2027-03-20", "2.5", "320");
      const events = b.build();
      const state = projectLedger(events);
      expect(state.invalid).toEqual([]);
      expect(state.lotJournal).toContainEqual({
        kind: "units",
        asset_id: "stock_s",
        event_id: split.id,
        ratio: "1/4",
      });
      const report = reportOf(events, 2027);
      expect(text(lineOf(report, loss.id).deferred_eur)).toBe("-200");
      expect(text(lineOf(report, loss.id).computable_eur_rounded)).toBe("0");
    });

    it("changes nothing when the split falls before the sale", () => {
      // Sale and purchases are measured after the split: nothing to convert.
      const b = taxBuilder();
      buy(b, "stock_s", "2027-01-11", "10", "100");
      b.corporateAction({
        kind: "split",
        asset_id: "stock_s",
        effective_date: "2027-02-01",
        effects: [{ op: "scale", ratio: "2" }],
      });
      const loss = sell(b, "stock_s", "2027-03-01", "10", "40");
      const again = buy(b, "stock_s", "2027-03-20", "10", "40");
      const report = reportOf(b.build(), 2027);
      // 10 of the 20 after the split cost 500 and sell for 400: −100, all deferred.
      expect(text(lineOf(report, loss.id).deferred_eur)).toBe("-100");
      const deferral = report.wash_sale.deferred.find((d) => d.event_id === loss.id);
      expect(deferral?.acquisitions.map((a) => [a.event_id, a.units.toString()])).toEqual([
        [again.id, "10"],
      ]);
    });
  });

  it("#2b: a transfer in counts as an acquisition, unless the setting says otherwise", () => {
    const run = (counts: boolean) => {
      const b = taxBuilder({ ...DEFAULT_SETTINGS, wash_sale_transfer_counts: counts });
      buy(b, "fund_g", "2027-01-11", "10", "100");
      const loss = sell(b, "fund_g", "2027-03-01", "10", "90");
      buy(b, "fund_f", "2027-01-12", "10", "100");
      // Inside the two months of a fund, which is its window since the
      // correction of criterion #2: what this pins is #2b, not the window.
      transfer(b, "fund_f", "fund_g", "2027-04-03", "10", "10");
      const report = reportOf(b.build(), 2027);
      return { line: lineOf(report, loss.id), report };
    };
    const counting = run(true);
    expect(text(counting.line.deferred_eur)).toBe("-100");
    expect(counting.line.criteria).toContain("2b");
    expect(counting.line.deferral?.acquisitions.map((a) => a.via_transfer)).toEqual([true]);
    // Not counting it computes the loss this year: the base stays at zero and
    // there is 100 more to carry forward, which the current reading defers.
    const alternative = counting.report.doubtful.find((e) => e.criterion === "2b");
    expect(text(alternative?.base_difference_eur)).toBe("0");
    expect(text(alternative?.pending_difference_eur)).toBe("-100");
    expect(text(alternative?.deferred_difference_eur)).toBe("100");
    expect(alternative?.direction).toBe("conservative");
    expect(text(run(false).line.deferred_eur)).toBe("0");
  });

  it("marks as provisional a loss whose window is still open on the date of the query", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const loss = sell(b, "stock_s", "2027-12-01", "10", "90");
    const open = reportOf(b.build(), 2027, "2028-01-15");
    expect(lineOf(open, loss.id).provisional_until).toBe("2028-02-01");
    expect(open.notes.find((n) => n.code === "tax_window_open")?.details).toMatchObject({
      loss_eur: "-100",
      window_end: "2028-02-01",
    });
    // The last day of the window still counts (ADR-0014): on it, a purchase
    // still defers, so the loss is still provisional. The day after, it is not.
    expect(lineOf(reportOf(b.build(), 2027, "2028-02-01"), loss.id).provisional_until).toBe(
      "2028-02-01",
    );
    expect(
      lineOf(reportOf(b.build(), 2027, "2028-02-02"), loss.id).provisional_until,
    ).toBeUndefined();
  });

  it("gives the open window the whole loss at stake: its own and what it releases", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-02-01", "10", "90");
    buy(b, "stock_s", "2027-03-01", "10", "90");
    // −50 of its own and −100 released from the February loss: −150 at stake.
    const loss = sell(b, "stock_s", "2027-12-01", "10", "85");
    const open = reportOf(b.build(), 2027, "2028-01-15");
    expect(open.notes.find((n) => n.event_id === loss.id)?.details).toMatchObject({
      loss_eur: "-150",
      window_end: "2028-02-01",
    });
  });

  /**
   * The bookkeeping invariant, not the window: the ledger pins a year for the
   * fund so that the release is itself deferred again (#21) and there is more
   * than one deferral to add up.
   */
  it("keeps the deferred loss whole: what is deferred is released or still pending, to the last decimal", () => {
    const b = taxBuilder({
      ...DEFAULT_SETTINGS,
      wash_sale_window: { ...DEFAULT_SETTINGS.wash_sale_window, fund: "1y" },
    });
    buy(b, "fund_f", "2027-01-11", "3", "100");
    sell(b, "fund_f", "2027-02-01", "3", "70");
    buy(b, "fund_f", "2027-02-15", "7", "70");
    sell(b, "fund_f", "2027-05-03", "1", "72");
    transfer(b, "fund_f", "fund_g", "2027-06-01", "3", "9");
    sell(b, "fund_g", "2027-08-02", "4", "24");
    const walk = walkWashSales(projectLedger(b.build()), "2035-01-01", new Map());
    const total = (amounts: readonly { amount: Decimal }[]): Decimal =>
      amounts.reduce((sum, money) => sum.add(money.amount), Decimal.ZERO);
    const deferred = total(walk.deferrals.map((d) => d.amount_eur));
    const released = total(walk.outcomes.flatMap((o) => o.released.map((r) => r.amount_eur)));
    const pending = total(walk.pending.map((p) => p.amount_eur));
    // The release of the first loss is a loss again and is deferred again (#21).
    expect(walk.deferrals.length).toBeGreaterThan(1);
    expect(released.isZero()).toBe(false);
    expect(pending.isZero()).toBe(false);
    expect(deferred.eq(released.add(pending))).toBe(true);
  });
});
