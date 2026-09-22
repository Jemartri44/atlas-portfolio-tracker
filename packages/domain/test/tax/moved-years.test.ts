// The warning of a settings change, now reading the savings base (Q12).

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { movedTaxYears } from "../../src/tax/year.js";
import { buy, HAND_SETTINGS, sell, taxBuilder, text } from "./helpers.js";

describe("movedTaxYears", () => {
  const ledger = () => {
    const b = taxBuilder();
    buy(b, "etc_e", "2027-01-11", "10", "100");
    sell(b, "etc_e", "2027-06-01", "10", "80");
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-09-01", "10", "150");
    return b.build();
  };

  /**
   * The change goes from the ETC pinned to a capital gain to the default of
   * criterion #24, movable capital income. Reading it the other way round
   * would compare the default with itself and move nothing.
   */
  const AS_GAIN = { ...DEFAULT_SETTINGS, income_category: { etc: "capital_gain" as const } };

  it("sees a change of income category that moves the base without moving any realized gain", () => {
    const moved = movedTaxYears(ledger(), AS_GAIN, DEFAULT_SETTINGS, 2029);
    // 500 − 200 = 300 as capital gains; with the ETC as movable capital income
    // the −200 only offsets 25 % of the 500, so the base is 375 and **−75 stay
    // pending**: 2028 keeps its base of 0 and inherits a different balance,
    // which is why it is listed too (feature 010, §1.5).
    expect(
      moved.map((m) => [
        m.year,
        text(m.before),
        text(m.after),
        text(m.pending_before),
        text(m.pending_after),
      ]),
    ).toEqual([
      [2027, "300", "375", "0", "-75"],
      [2028, "0", "0", "0", "-75"],
    ]);
  });

  it("reads the same change backwards: what was pending stops being pending", () => {
    const moved = movedTaxYears(ledger(), DEFAULT_SETTINGS, AS_GAIN, 2029);
    expect(
      moved.map((m) => [
        m.year,
        text(m.before),
        text(m.after),
        text(m.pending_before),
        text(m.pending_after),
      ]),
    ).toEqual([
      [2027, "375", "300", "-75", "0"],
      [2028, "0", "0", "-75", "0"],
    ]);
  });

  it("sees the last closed year, the one declared in May", () => {
    // Standing in 2028, 2027 is the year about to be declared: it must be seen.
    const moved = movedTaxYears(ledger(), AS_GAIN, DEFAULT_SETTINGS, 2028);
    expect(moved.map((m) => [m.year, text(m.before), text(m.after)])).toEqual([
      [2027, "300", "375"],
    ]);
  });

  it("says nothing when the base does not move, or for the current year", () => {
    expect(movedTaxYears(ledger(), DEFAULT_SETTINGS, DEFAULT_SETTINGS, 2029)).toEqual([]);
    expect(movedTaxYears(ledger(), AS_GAIN, DEFAULT_SETTINGS, 2027)).toEqual([]);
  });

  it("follows a figure into a year the other reading does not reach", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    b.sell({
      account_id: "acc_a",
      asset_id: "stock_s",
      trade_date: "2027-12-30",
      value_date: "2028-01-03",
      quantity: "10",
      unit_price: "110",
      fx_rate_date: "2027-12-30",
    });
    const moved = movedTaxYears(
      b.build(),
      DEFAULT_SETTINGS,
      { ...DEFAULT_SETTINGS, fiscal_date_rule: { stock: "value_date" } },
      2030,
    );
    expect(moved.map((m) => [m.year, text(m.before), text(m.after)])).toEqual([
      [2027, "100", "0"],
      [2028, "0", "100"],
    ]);
    // And the other way round: now it is the current reading that starts later.
    const back = movedTaxYears(
      b.build(),
      { ...DEFAULT_SETTINGS, fiscal_date_rule: { stock: "value_date" } },
      DEFAULT_SETTINGS,
      2030,
    );
    expect(back.map((m) => [m.year, text(m.before), text(m.after)])).toEqual([
      [2027, "0", "100"],
      [2028, "100", "0"],
    ]);
  });

  it("compares nothing when a reading cannot be computed", () => {
    const b = taxBuilder();
    b.buy({
      account_id: "acc_a",
      asset_id: "fund_f",
      trade_date: "2027-01-15",
      value_date: "2027-01-18",
      quantity: "10",
      unit_price: "100",
    });
    b.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      trade_date: "2027-01-14",
      value_date: "2027-01-20",
      quantity: "10",
      unit_price: "90",
      fx_rate_date: "2027-01-14",
    });
    expect(
      movedTaxYears(
        b.build(),
        DEFAULT_SETTINGS,
        { ...DEFAULT_SETTINGS, fiscal_date_rule: { fund: "trade_date" } },
        2029,
      ),
    ).toEqual([]);
    const old = taxBuilder();
    buy(old, "stock_s", "2016-01-11", "10", "100");
    sell(old, "stock_s", "2016-06-01", "10", "90");
    expect(movedTaxYears(old.build(), DEFAULT_SETTINGS, DEFAULT_SETTINGS, 2029)).toEqual([]);
  });

  /**
   * A year whose **only** moving figure is the deferred loss, which the
   * warning used to miss entirely: it compared the base and what the year left
   * pending, two of the three figures a return declares.
   *
   * 2026 has a gain of 300,00 and a loss of 300,00 whose repurchase of 1
   * September falls **outside** the two months and **inside** the year. Read at
   * two months the loss is computable and cancels the gain; read at a year it
   * is deferred and the base becomes 300,00. From 2027 on the ledger is empty,
   * so base and pending are 0,00 either way and the **only** difference is the
   * 300,00 the rule still holds deferred — the very thing a change of window
   * moves first.
   */
  it("sees a year where nothing moves but the deferred loss", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_t", "2026-01-10", "10", "100");
    sell(b, "stock_t", "2026-03-01", "10", "130");
    buy(b, "stock_s", "2026-01-10", "10", "100");
    sell(b, "stock_s", "2026-06-01", "10", "70");
    buy(b, "stock_s", "2026-09-01", "10", "70");
    const atOneYear = {
      ...HAND_SETTINGS,
      wash_sale_window: { ...HAND_SETTINGS.wash_sale_window, stock: "1y" as const },
    };
    const moved = movedTaxYears(b.build(), HAND_SETTINGS, atOneYear, 2029);
    expect(
      moved.map((entry) => [
        entry.year,
        text(entry.before),
        text(entry.after),
        text(entry.deferred_before),
        text(entry.deferred_after),
      ]),
    ).toEqual([
      [2026, "0", "300", "0", "-300"],
      [2027, "0", "0", "0", "-300"],
      [2028, "0", "0", "0", "-300"],
    ]);
    // And the years that move only there leave the same balance pending.
    expect(moved.map((entry) => [text(entry.pending_before), text(entry.pending_after)])).toEqual([
      ["0", "0"],
      ["0", "0"],
      ["0", "0"],
    ]);
  });

  it("lets any other error through: a duplicated id is not something to hide", () => {
    const events = ledger();
    expect(() =>
      movedTaxYears(
        [...events, events[events.length - 1] as never],
        DEFAULT_SETTINGS,
        DEFAULT_SETTINGS,
        2029,
      ),
    ).toThrow(expect.objectContaining({ code: "duplicate_id" }));
  });
});
