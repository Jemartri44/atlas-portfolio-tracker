// The core weights, as rows that can be painted.
//
// Nothing is computed here: `coreWeights` decides the value, the weight and the
// deviation, and even **which rows are off target** — that arrives as a warning
// with its `asset_id`, and turning a set of warnings into a mark on a row is
// presentation. Recomputing `|deviation| > threshold` in the interface would be
// the second place the rule lives.

import {
  type ClassSubtotal,
  type CoreWeightRow,
  type CoreWeights,
  Money,
  type Quantity,
  type Warning,
} from "@atlas/domain";
import { valueLabel } from "../../format/labels.js";
import { displayName, type NameIndex, NO_NAMES, unitsOf } from "../../format/names.js";

export interface WeightRow {
  assetId: string;
  /** The name it has today, never the identifier. */
  name: string;
  assetClass: string;
  /**
   * `Quantity` and `Money`, **never strings**. A quantity times a public price
   * is the amount, so both are masked by the privacy mode, and the only thing
   * that can paint either of them is `Amount`. Handing them over as text let
   * eight call sites interpolate them straight into the markup and walk past the
   * mask; a type that cannot be printed by accident is worth more than eight
   * corrections.
   */
  quantity: Quantity;
  /** What the quantity counts: "part.", "acc.", "uds.". */
  units: string;
  /** Absent means "no price", which is not the same as zero. Carries its currency. */
  unitValue?: Money;
  priceDate?: string;
  ageDays?: number;
  stale: boolean;
  value?: Money;
  weightPct?: string;
  targetPct: string;
  deviationPp?: string;
  /** The domain raised `deviation_above_threshold` for this asset. */
  offTarget: boolean;
}

export interface WeightClassRow {
  assetClass: string;
  label: string;
  value: Money;
  partial: boolean;
  weightPct?: string;
  targetPct: string;
  deviationPp?: string;
  /** The domain raised `satellite_below_minimum` for this class. */
  belowMinimum: boolean;
  rows: WeightRow[];
}

export interface WeightsView {
  date: string;
  classes: WeightClassRow[];
  /**
   * Absent when the total is partial and what is known of it is zero: every
   * position lacks a price, and that is "sin dato", never "0,00 EUR".
   */
  total?: Money | undefined;
  partial: boolean;
  /** Names of what has a position and no price, ready to print. */
  missing: string[];
  stale: string[];
  warnings: readonly Warning[];
}

const subjectsOf = (warnings: readonly Warning[], code: string, field: string): Set<string> => {
  const subjects = new Set<string>();
  for (const warning of warnings) {
    if (warning.code === code && typeof warning.details[field] === "string") {
      subjects.add(warning.details[field] as string);
    }
  }
  return subjects;
};

const rowOf = (
  row: CoreWeightRow,
  names: NameIndex,
  offTarget: ReadonlySet<string>,
): WeightRow => ({
  assetId: row.asset_id,
  name: displayName(names, row.asset_id),
  assetClass: row.asset_class,
  quantity: row.quantity,
  units: unitsOf(names, row.asset_id),
  ...(row.price === undefined
    ? {}
    : {
        unitValue: Money.of(row.price.unit_value, row.price.currency),
        priceDate: row.price.date,
        ageDays: row.price.age_days,
      }),
  stale: row.price?.stale === true,
  ...(row.value_eur === undefined ? {} : { value: row.value_eur }),
  ...(row.weight_pct === undefined ? {} : { weightPct: row.weight_pct.toString() }),
  targetPct: row.target_pct.toString(),
  ...(row.deviation_pp === undefined ? {} : { deviationPp: row.deviation_pp.toString() }),
  offTarget: offTarget.has(row.asset_id),
});

const classOf = (
  subtotal: ClassSubtotal,
  rows: readonly WeightRow[],
  belowMinimum: ReadonlySet<string>,
): WeightClassRow => ({
  assetClass: subtotal.asset_class,
  label: valueLabel(subtotal.asset_class),
  value: subtotal.value_eur,
  partial: subtotal.partial,
  ...(subtotal.weight_pct === undefined ? {} : { weightPct: subtotal.weight_pct.toString() }),
  targetPct: subtotal.target_pct.toString(),
  ...(subtotal.deviation_pp === undefined ? {} : { deviationPp: subtotal.deviation_pp.toString() }),
  belowMinimum: belowMinimum.has(subtotal.asset_class),
  rows: rows.filter((row) => row.assetClass === subtotal.asset_class),
});

export const weightsView = (view: CoreWeights, names: NameIndex = NO_NAMES): WeightsView => {
  const offTarget = subjectsOf(view.warnings, "deviation_above_threshold", "asset_id");
  const belowMinimum = subjectsOf(view.warnings, "satellite_below_minimum", "asset_class");
  const rows = view.rows.map((row) => rowOf(row, names, offTarget));
  return {
    date: view.date,
    classes: view.by_class.map((subtotal) => classOf(subtotal, rows, belowMinimum)),
    ...(view.partial && view.total_eur.isZero() ? {} : { total: view.total_eur }),
    partial: view.partial,
    missing: view.missing_prices.map((id) => displayName(names, id)),
    stale: view.stale_prices.map((id) => displayName(names, id)),
    warnings: view.warnings,
  };
};
