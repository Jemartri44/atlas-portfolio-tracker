// The patrimony, in blocks that can be painted.
//
// It keeps the rule the CLI already honours: **the total shown is the sum of
// the figures shown**, so a reader who adds the column gets the number at the
// bottom (`netWorth` keeps the exact value separately). And it never returns a
// single undecomposed number: the breakdown is the point (constitution III,
// exception 2).

import { type CashLine, Money, type NetWorth } from "@atlas/domain";
import { valueLabel } from "../format/labels.js";
import { displayName, type NameIndex, NO_NAMES } from "../format/names.js";

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
}

export interface NetWorthBlock {
  label: string;
  subtotal: Money;
  partial: boolean;
  lines: NetWorthLine[];
  /** What is missing in this block, to say it without making the user hunt. */
  missing: string[];
}

export interface NetWorthView {
  date: string;
  total: Money;
  partial: boolean;
  blocks: NetWorthBlock[];
  /** Everything missing across the three blocks. */
  missing: string[];
}

const EUR = "EUR";

/** Sum of the **rounded** figures, which is what the screen shows (domain). */
const shownSum = (values: readonly (Money | undefined)[]): Money => Money.sumShown(values, EUR);

const cashDetail = (row: CashLine): string | undefined => {
  if (row.currency === EUR) {
    return undefined;
  }
  if (row.fx_rate === undefined) {
    return "sin tipo de cambio conocido";
  }
  const age = row.fx_age_days ?? 0;
  const dated = row.fx_rate_dated === true ? "" : " (fecha de la operación)";
  return `tipo ${row.fx_rate.rate.toString()} del ${row.fx_rate.date}${dated}, ${age} días${
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
  const core: NetWorthBlock = {
    label: "Núcleo",
    subtotal: shownSum(view.core.by_class.map((subtotal) => subtotal.value_eur)),
    partial: view.core.partial,
    missing: named(view.core.missing_prices),
    lines: view.core.by_class.map((subtotal) => ({
      name: valueLabel(subtotal.asset_class),
      value: subtotal.value_eur,
      ...(subtotal.partial ? { missing: "falta algún precio" } : {}),
    })),
  };
  const bucket: NetWorthBlock = {
    label: "Cubo",
    subtotal: shownSum(view.bucket.rows.map((row) => row.value_eur)),
    partial: view.bucket.partial,
    missing: named(view.bucket.missing_prices),
    lines: view.bucket.rows.map((row) => ({
      name: displayName(names, row.asset_id),
      ...(row.account_id === undefined ? {} : { detail: displayName(names, row.account_id) }),
      ...(row.value_eur === undefined ? { missing: "sin precio" } : { value: row.value_eur }),
    })),
  };
  const cash: NetWorthBlock = {
    label: "Efectivo",
    subtotal: shownSum(view.cash.rows.map((row) => row.value_eur)),
    partial: view.cash.partial,
    missing: view.cash.missing_rates,
    lines: view.cash.rows.map((row) => ({
      name: `${displayName(names, row.account_id)} · ${row.currency}`,
      ...(cashDetail(row) === undefined ? {} : { detail: cashDetail(row) as string }),
      ...(row.value_eur === undefined ? { missing: "sin convertir" } : { value: row.value_eur }),
    })),
  };
  const blocks = [core, bucket, cash];
  return {
    date: view.date,
    total: shownSum(blocks.map((block) => block.subtotal)),
    partial: view.partial,
    blocks,
    missing: blocks.flatMap((block) => block.missing),
  };
};
