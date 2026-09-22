// The rows of the form against the lines of the engine (ficha F5, question Q10
// of feature 010).
//
// The engine folds what a repurchase released **into the disposal that releases
// it** and applies the rule again to the total (#21). The form of 2025 wants
// the opposite: every operation with its own result, and what comes back from
// an earlier year in a section of its own. The totals are the same and the rows
// are not, and the only way to be sure the reordering neither creates nor loses
// a euro is to add both sides up.

import { describe, expect, it } from "vitest";
import { taxBoxes } from "../../src/tax/boxes/boxes.js";
import type { BoxEntry, TaxBoxes } from "../../src/tax/boxes/report.js";
import { taxYear } from "../../src/tax/year.js";
import { buy, HAND_SETTINGS, rowsAddUpToTheEngine, sell, taxBuilder, text } from "./helpers.js";

const TODAY = "2035-01-01";

const amountOf = (boxes: TaxBoxes, concept: string, event?: string): string => {
  const found = boxes.entries.filter(
    (entry) => entry.concept === concept && (event === undefined || entry.row?.event_id === event),
  );
  if (found.length !== 1) {
    throw new Error(`expected one ${concept}, found ${found.length}`);
  }
  return text((found[0] as BoxEntry).exact_eur);
};

/**
 * The three years of the test the direction asked for (Q10): a loss deferred
 * whole, a disposal with a gain of its own that releases it and **defers it
 * again** (#21), and the sale that finally brings it back.
 *
 * Its point is that the row of a releasing disposal is a **gain** on the form,
 * and what it released is declared in the section of earlier years, attributed
 * to the loss it came from. If the attribution went astray, the rows of a year
 * would stop adding up to what the engine computes for it, which is what the
 * last check of each year is.
 */
const reDeferred = () => {
  const b = taxBuilder(HAND_SETTINGS);
  // Outside the window of the loss, so nothing else competes for it.
  buy(b, "stock_s", "2025-11-03", "10", "100");
  const loss = sell(b, "stock_s", "2026-03-02", "10", "90");
  buy(b, "stock_s", "2026-04-01", "10", "90");
  const releases = sell(b, "stock_s", "2027-03-01", "10", "93");
  buy(b, "stock_s", "2027-04-01", "10", "93");
  const last = sell(b, "stock_s", "2028-03-01", "10", "100");
  return { events: b.build(), loss, releases, last };
};

describe("the rows of the form, by origin of the loss", () => {
  const { events, loss, releases, last } = reDeferred();

  it("year 1: the loss is obtained in full and imputable in nothing", () => {
    const boxes = taxBoxes(events, 2026, { today: TODAY });
    expect(amountOf(boxes, "gp.listed_shares.loss", loss.id)).toBe("-100");
    expect(amountOf(boxes, "gp.listed_shares.loss_imputable", loss.id)).toBe("0");
    expect(text(taxYear(events, 2026, { today: TODAY }).capital_gains.balance_eur)).toBe("0");
    expect(rowsAddUpToTheEngine(events, 2026, TODAY)).toEqual({ rows: "0", engine: "0" });
  });

  it("year 2: the disposal that releases it is a gain, and what it frees goes to its origin", () => {
    const boxes = taxBoxes(events, 2027, { today: TODAY });
    // Its own result is +30,00: the −100,00 it released is not in this row.
    expect(amountOf(boxes, "gp.listed_shares.gain", releases.id)).toBe("30");
    expect(boxes.entries.filter((entry) => entry.concept === "gp.listed_shares.loss")).toEqual([]);
    // −100,00 of 2026 less the −70,00 that #21 defers again: 30,00 imputable.
    expect(amountOf(boxes, "gp.prior_years.loss")).toBe("-30");
    expect(
      (boxes.entries.find((entry) => entry.concept === "gp.prior_years.loss") as BoxEntry)
        .origin_year,
    ).toBe(2026);
    // 30,00 − 30,00 = 0,00, which is what the engine computes for the year.
    expect(text(taxYear(events, 2027, { today: TODAY }).capital_gains.balance_eur)).toBe("0");
    expect(rowsAddUpToTheEngine(events, 2027, TODAY)).toEqual({ rows: "0", engine: "0" });
  });

  it("year 3: the repurchase is sold and the rest of the loss of 2026 comes back", () => {
    const boxes = taxBoxes(events, 2028, { today: TODAY });
    expect(amountOf(boxes, "gp.listed_shares.gain", last.id)).toBe("70");
    expect(amountOf(boxes, "gp.prior_years.loss")).toBe("-70");
    expect(amountOf(boxes, "gp.prior_years.losses")).toBe("-70");
    expect(text(taxYear(events, 2028, { today: TODAY }).capital_gains.balance_eur)).toBe("0");
    expect(rowsAddUpToTheEngine(events, 2028, TODAY)).toEqual({ rows: "0", engine: "0" });
  });

  it("never attributes a released loss to the disposal that released it", () => {
    // The mutation that would pass every total and get every row wrong: giving
    // the deferral of year 2 to the sale of year 2 instead of to the loss of
    // year 1. Then the row of 2027 would carry a loss imputable of its own.
    const boxes = taxBoxes(events, 2027, { today: TODAY });
    expect(
      boxes.entries.filter((entry) => entry.concept === "gp.listed_shares.loss_imputable"),
    ).toEqual([]);
  });
});

describe("the layout against the engine, ledger by ledger", () => {
  it("adds the rows up to the balance of the year in a ledger with a loss of its own year", () => {
    // A loss and a gain of the same year, with part of the loss deferred: the
    // row of the loss carries the imputable part and nothing goes to the
    // section of earlier years.
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-01-05", "10", "100");
    buy(b, "stock_t", "2027-01-05", "10", "100");
    sell(b, "stock_s", "2027-03-01", "10", "80");
    buy(b, "stock_s", "2027-03-20", "5", "80");
    sell(b, "stock_t", "2027-09-01", "10", "150");
    const events = b.build();
    const boxes = taxBoxes(events, 2027, { today: TODAY });
    // −200,00 of its own, half of it deferred onto the five units bought back.
    expect(amountOf(boxes, "gp.listed_shares.loss")).toBe("-200");
    expect(amountOf(boxes, "gp.listed_shares.loss_imputable")).toBe("-100");
    expect(boxes.entries.filter((entry) => entry.concept === "gp.prior_years.loss")).toEqual([]);
    const totals = rowsAddUpToTheEngine(events, 2027, TODAY);
    expect(totals.rows).toBe(totals.engine);
    expect(totals.rows).toBe("400");
  });
});

describe("a deferral that comes from more than one earlier loss", () => {
  /**
   * Two losses defer onto the **same** repurchase, and the sale of that
   * repurchase releases both at once and defers half of the result again. The
   * layout then has to share what is still deferred between the two origins,
   * pro rata, and that is the only case where the split has more than one
   * release to spread over.
   *
   * - `S1` loses −100,00 and `S2` −200,00; both defer onto the 20 units bought
   *   on 05/01, ten each.
   * - `S3` sells those 20 units: it loses −100,00 of its own and releases the
   *   −300,00 they carried, so it looks at −400,00 and defers half, −200,00.
   * - Of that −200,00, its own loss takes −100,00 and the rest goes to the two
   *   it released in the ratio 100 : 200.
   */
  const shared = () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2026-06-01", "10", "100");
    buy(b, "stock_s", "2026-06-02", "10", "100");
    buy(b, "stock_s", "2027-01-05", "20", "100");
    const first = sell(b, "stock_s", "2027-01-10", "10", "90");
    const second = sell(b, "stock_s", "2027-01-15", "10", "80");
    const third = sell(b, "stock_s", "2027-06-01", "20", "95");
    buy(b, "stock_s", "2027-07-01", "10", "95");
    return { events: b.build(), first, second, third };
  };

  it("shares what is still deferred between the two losses, in proportion", () => {
    const { events, first, second, third } = shared();
    const boxes = taxBoxes(events, 2027, { today: TODAY });
    expect(amountOf(boxes, "gp.listed_shares.loss", first.id)).toBe("-100");
    expect(amountOf(boxes, "gp.listed_shares.loss", second.id)).toBe("-200");
    expect(amountOf(boxes, "gp.listed_shares.loss", third.id)).toBe("-100");
    // −100,00 of the −200,00 still deferred belongs to the third sale itself,
    // and the other −100,00 to the two it released, as 100 : 200.
    expect(amountOf(boxes, "gp.listed_shares.loss_imputable", first.id)).toBe("-66.6666666667");
    expect(amountOf(boxes, "gp.listed_shares.loss_imputable", second.id)).toBe("-133.3333333333");
    expect(amountOf(boxes, "gp.listed_shares.loss_imputable", third.id)).toBe("0");
    const totals = rowsAddUpToTheEngine(events, 2027, TODAY);
    expect(totals.rows).toBe(totals.engine);
    expect(totals.rows).toBe("-200");
  });
});
