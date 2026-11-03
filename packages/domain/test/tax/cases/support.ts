// Reading a report the way the hand calculations are written: amounts with two
// decimals, boxes by number.

import { Money } from "../../../src/money/money.js";
import { taxBoxes } from "../../../src/tax/boxes/boxes.js";
import type { BoxEntry } from "../../../src/tax/boxes/report.js";
import type { TaxYearReport } from "../../../src/tax/report.js";
import { taxYear } from "../../../src/tax/year.js";
import { type Case, ledgerOf, TODAY } from "./short-form.js";

/** An amount as the user types it: half-up to cents, always two decimals. */
export const cents = (money: Money): string => {
  const [whole, fraction = ""] = money.roundToCents().amount.toString().split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
};

export const reportOf = (c: Case, year: number): TaxYearReport =>
  taxYear(ledgerOf(c), year, { today: TODAY });

/**
 * One box of the form. `"0312"` is a box that holds a single figure (or the
 * same one in every place it appears); `"0312@2025-06-10"` is the row of the
 * operation of that fiscal date, `"1633@USD"` the row of that currency, and
 * `"1270#2025"` the figure of the loss of that origin year.
 */
export const boxesOf = (c: Case, year: number) => {
  const boxes = taxBoxes(ledgerOf(c), year, { today: TODAY });
  const entries = (key: string): BoxEntry[] => {
    const [, number = "", row, origin] = /^(\d+)(?:@(.+)|#(\d+))?$/.exec(key) ?? [];
    return boxes.entries.filter(
      (entry) =>
        entry.box === number &&
        (row === undefined ||
          entry.row?.fiscal_date === row ||
          entry.row?.asset_id === row ||
          entry.row?.currency === row) &&
        (origin === undefined || entry.origin_year === Number(origin)),
    );
  };
  return {
    boxes,
    /** The figure of a box, or `undefined` when it has none (a box the engine cannot fill). */
    at: (key: string): string | undefined => {
      const found = entries(key);
      if (found.length === 0) {
        throw new Error(`no entry for ${key}`);
      }
      const values = new Set(found.map((entry) => entry.amount_eur && cents(entry.amount_eur)));
      if (values.size !== 1) {
        throw new Error(`${key} holds several figures: ${[...values].join(", ")}`);
      }
      return [...values][0];
    },
  };
};

/** The loss still deferred at 31/12, summed over the lots that carry it. */
export const deferredAtYearEnd = (report: TaxYearReport): string =>
  cents(
    report.wash_sale.pending.reduce(
      (total, entry) => total.add(entry.amount_eur),
      Money.zero("EUR"),
    ),
  );
