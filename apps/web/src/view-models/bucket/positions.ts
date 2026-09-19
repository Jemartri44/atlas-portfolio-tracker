// Open positions of the bucket, as rows.
//
// The weight of a position **inside the bucket** is the one figure this file
// works out, and it is a division of two figures the domain already gives
// (`value_eur` over `total_value_eur`): presentation, not a rule — and never a
// weight against the core, which would be the two books mixing (constitution
// III).

import {
  type BucketPosition,
  type BucketPositions,
  Decimal,
  Money,
  type Quantity,
  type Warning,
} from "@atlas/domain";
import { displayName, type NameIndex, NO_NAMES } from "../../format/names.js";

export interface BucketPositionRow {
  accountId: string;
  assetId: string;
  name: string;
  accountName: string;
  /** `Quantity`, never a string: see the note in `core/weights.ts`. */
  quantity: Quantity;
  unitCost?: Money;
  cost?: Money;
  /** The price in its own currency; absent means "no price", not zero. */
  unitValue?: Money;
  priceDate?: string;
  ageDays?: number;
  stale: boolean;
  value?: Money;
  unrealized?: Money;
  unrealizedPct?: string;
  /** Share of the bucket this position is; absent while the bucket total is partial. */
  weightPct?: string;
  thesisId?: string;
  daysOpen?: number;
  horizonDays?: number;
  horizonExceeded: boolean;
  invalidation?: string;
}

export interface BucketPositionsView {
  date: string;
  rows: BucketPositionRow[];
  /** Absent when there are positions and not one of them has a price: no data, never a zero. */
  totalValue?: Money | undefined;
  totalCost: Money;
  partial: boolean;
  missing: string[];
  warnings: readonly Warning[];
}

const HUNDRED = Decimal.parse("100");

/**
 * The share of the bucket, as a decimal string. It is only computed when the
 * bucket total is **whole**: a percentage over a partial total would read as a
 * smaller share than it is, which is the same lie as a partial sum.
 */
const weightOf = (row: BucketPosition, total: Money, partial: boolean): string | undefined => {
  if (partial || row.value_eur === undefined || total.isZero()) {
    return undefined;
  }
  return row.value_eur.amount.div(total.amount).mul(HUNDRED).toString();
};

const rowOf = (
  row: BucketPosition,
  total: Money,
  partial: boolean,
  names: NameIndex,
): BucketPositionRow => ({
  accountId: row.account_id,
  assetId: row.asset_id,
  name: displayName(names, row.asset_id),
  accountName: displayName(names, row.account_id),
  quantity: row.quantity,
  ...(row.unit_cost_eur === undefined ? {} : { unitCost: row.unit_cost_eur }),
  ...(row.cost_eur === undefined ? {} : { cost: row.cost_eur }),
  ...(row.price === undefined
    ? {}
    : {
        unitValue: Money.of(row.price.unit_value, row.price.currency),
        priceDate: row.price.date,
        ageDays: row.price.age_days,
      }),
  stale: row.price?.stale === true,
  ...(row.value_eur === undefined ? {} : { value: row.value_eur }),
  ...(row.unrealized_eur === undefined ? {} : { unrealized: row.unrealized_eur }),
  ...(row.unrealized_pct === undefined ? {} : { unrealizedPct: row.unrealized_pct.toString() }),
  ...(weightOf(row, total, partial) === undefined
    ? {}
    : { weightPct: weightOf(row, total, partial) as string }),
  ...(row.thesis_id === undefined ? {} : { thesisId: row.thesis_id }),
  ...(row.days_open === undefined ? {} : { daysOpen: row.days_open }),
  ...(row.expected_horizon_days === undefined ? {} : { horizonDays: row.expected_horizon_days }),
  horizonExceeded: row.horizon_exceeded === true,
  ...(row.invalidation === undefined ? {} : { invalidation: row.invalidation }),
});

export const bucketPositionsView = (
  view: BucketPositions,
  names: NameIndex = NO_NAMES,
): BucketPositionsView => ({
  date: view.date,
  rows: view.rows.map((row) => rowOf(row, view.total_value_eur, view.partial, names)),
  ...(view.rows.length > 0 && view.rows.every((row) => row.value_eur === undefined)
    ? {}
    : { totalValue: view.total_value_eur }),
  totalCost: view.total_cost_eur,
  partial: view.partial,
  missing: view.missing_prices.map((id) => displayName(names, id)),
  warnings: view.warnings,
});
