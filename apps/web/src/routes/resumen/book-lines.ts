// What the tiles of the net worth know on the first paint: the small line of each book over the
// last year and how many investment accounts hold cash. The returns and the bucket against the
// index come later (`summary-extras.ts`).

import type { CivilDate, Money, NetWorth, NetWorthPoint, NetWorthSeries } from "@atlas/domain";
import type { BlockKey } from "../../view-models/index.js";

export interface BookLines {
  cashAccounts: number;
  spark: Record<BlockKey, (number | null)[]>;
}

export const bookLines = (series: NetWorthSeries, worth: NetWorth, from: CivilDate): BookLines => {
  const points = series.points.filter((point) => point.date >= from);
  // A hole stays a hole: the line is cut there, never joined.
  const lineOf = (pick: (point: NetWorthPoint) => Money | undefined) =>
    points.map((point) => {
      const value = pick(point);
      return value === undefined ? null : Number(value.amount.toString());
    });
  return {
    cashAccounts: new Set(
      worth.cash.rows.filter((row) => !row.balance.isZero()).map((row) => row.account_id),
    ).size,
    spark: {
      core: lineOf((point) => point.core_eur),
      bucket: lineOf((point) => point.bucket_eur),
      cash: lineOf((point) => point.cash_eur),
    },
  };
};
