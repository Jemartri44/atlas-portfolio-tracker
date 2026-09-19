// The patrimony, in blocks that can be painted.
//
// It keeps the rule the CLI already honours: **the total shown is the sum of
// the figures shown**, so a reader who adds the column gets the number at the
// bottom (`netWorth` keeps the exact value separately). And it never returns a
// single undecomposed number: the breakdown is the point (constitution III,
// exception 2).

import { type CashLine, Money, type NetWorth } from "@atlas/domain";
import { formatDate } from "../format/date.js";
import { valueLabel } from "../format/labels.js";
import { displayName, type NameIndex, NO_NAMES } from "../format/names.js";
import { countOf, formatExact } from "../format/number.js";

export interface NetWorthLine {
  /**
   * What the line is about, **ready to paint**: the asset class in Spanish, or
   * the current name of the asset or the account. The component used to run the
   * name through `valueLabel`, which would have translated an asset genuinely
   * called "Oro" into something else (review of 2026-09-18).
   */
  name: string;
  detail?: string | undefined;
  value?: Money | undefined;
  /** Why there is no value, when there is none. */
  missing?: string | undefined;
  /** The value covers only part of the line: some of what it adds up has no price. */
  partial?: boolean | undefined;
}

export interface NetWorthBlock {
  label: string;
  /**
   * The sum of the lines shown, or **nothing** when not one of them has a
   * value: a block made only of unpriced positions is "sin dato", never a zero
   * (constitution V). The review found "Renta fija 0,00 EUR · Oro 0,00 EUR ·
   * Cubo 0,00 EUR" on the summary, for assets that exist and have no price.
   */
  subtotal?: Money | undefined;
  partial: boolean;
  lines: NetWorthLine[];
  /** What is missing in this block, to say it without making the user hunt. */
  missing: string[];
}

export interface NetWorthView {
  date: string;
  /** Absent only when no block has a single known figure. */
  total?: Money | undefined;
  partial: boolean;
  blocks: NetWorthBlock[];
  /** Everything missing across the three blocks. */
  missing: string[];
}

const EUR = "EUR";

/**
 * Sum of the **rounded** figures, which is what the screen shows (domain), or
 * nothing when there is not a single figure to add: the sum of no data is no
 * data, not a zero.
 */
const shownSum = (values: readonly (Money | undefined)[]): Money | undefined =>
  values.some((value) => value !== undefined) ? Money.sumShown(values, EUR) : undefined;

/**
 * The subtotal of a block: the sum of its lines. A block with **no lines** is a
 * genuine zero (there is nothing there); a block whose lines all lack a value
 * is "sin dato" (there is something, and nobody knows what it is worth).
 */
const subtotalOf = (lines: readonly NetWorthLine[]): Money | undefined =>
  lines.length === 0 ? Money.zero(EUR) : shownSum(lines.map((line) => line.value));

const withSubtotal = (block: Omit<NetWorthBlock, "subtotal">): NetWorthBlock => ({
  ...block,
  subtotal: subtotalOf(block.lines),
});

const cashDetail = (row: CashLine): string | undefined => {
  if (row.currency === EUR) {
    return undefined;
  }
  if (row.fx_rate === undefined) {
    return "sin tipo de cambio conocido";
  }
  const age = row.fx_age_days ?? 0;
  const dated = row.fx_rate_dated === true ? "" : " (fecha de la operación)";
  return `tipo ${formatExact(row.fx_rate.rate.toString())} del ${formatDate(row.fx_rate.date)}${dated}, ${countOf(age, "día", "días")}${
    row.fx_stale === true ? ", caducado" : ""
  }`;
};

/**
 * `names` resolves the catalogue: the bucket lines and the cash lines are
 * identifiers in the projection (`ast_alpha`, `acc_mi`) and the user knows them
 * as "Alpha Robotics" and "Fondos indexados". The list of what is missing goes
 * through the same resolver, because it is the text of the note at the bottom
 * of the block (review of 2026-09-18). Without a catalogue every identifier
 * still prints as itself.
 */
export const netWorthView = (view: NetWorth, names: NameIndex = NO_NAMES): NetWorthView => {
  const named = (ids: readonly string[]): string[] => ids.map((id) => displayName(names, id));
  const core = withSubtotal({
    label: "Núcleo",
    partial: view.core.partial,
    missing: named(view.core.missing_prices),
    lines: view.core.by_class.map((subtotal) =>
      // A partial class whose known part is zero knows nothing at all: every
      // member of it lacks a price. That is "sin dato", not "0,00 EUR".
      subtotal.partial && subtotal.value_eur.isZero()
        ? { name: valueLabel(subtotal.asset_class), missing: "sin precio" }
        : {
            name: valueLabel(subtotal.asset_class),
            value: subtotal.value_eur,
            ...(subtotal.partial ? { partial: true, missing: "falta algún precio" } : {}),
          },
    ),
  });
  const bucket = withSubtotal({
    label: "Cubo",
    partial: view.bucket.partial,
    missing: named(view.bucket.missing_prices),
    lines: view.bucket.rows.map((row) => ({
      name: displayName(names, row.asset_id),
      ...(row.account_id === undefined ? {} : { detail: displayName(names, row.account_id) }),
      ...(row.value_eur === undefined ? { missing: "sin precio" } : { value: row.value_eur }),
    })),
  });
  const cash = withSubtotal({
    label: "Efectivo",
    partial: view.cash.partial,
    missing: view.cash.missing_rates,
    lines: view.cash.rows.map((row) => ({
      name: `${displayName(names, row.account_id)} · ${row.currency}`,
      ...(cashDetail(row) === undefined ? {} : { detail: cashDetail(row) as string }),
      ...(row.value_eur === undefined ? { missing: "sin convertir" } : { value: row.value_eur }),
    })),
  });
  const blocks = [core, bucket, cash];
  return {
    date: view.date,
    total: shownSum(blocks.map((block) => block.subtotal)),
    partial: view.partial,
    blocks,
    missing: blocks.flatMap((block) => block.missing),
  };
};
