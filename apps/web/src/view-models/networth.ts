// The patrimony, in blocks that can be painted.
//
// It keeps the rule the CLI already honours: **the total shown is the sum of
// the figures shown**, so a reader who adds the column gets the number at the
// bottom (`netWorth` keeps the exact value separately). And it never returns a
// single undecomposed number: the breakdown is the point (constitution III,
// exception 2).

import { type CashLine, Money, type NetWorth } from "@atlas/domain";

export interface NetWorthLine {
  /** What the line is about: an asset class, an asset, or an account and currency. */
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

/** Sum of the **rounded** figures, which is what the screen shows. */
const shownSum = (values: readonly (Money | undefined)[]): Money =>
  values.reduce<Money>(
    (total, value) => (value === undefined ? total : total.add(value.roundToCents())),
    Money.zero(EUR),
  );

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

export const netWorthView = (view: NetWorth): NetWorthView => {
  const core: NetWorthBlock = {
    label: "Núcleo",
    subtotal: shownSum(view.core.by_class.map((subtotal) => subtotal.value_eur)),
    partial: view.core.partial,
    missing: view.core.missing_prices,
    lines: view.core.by_class.map((subtotal) => ({
      name: subtotal.asset_class,
      value: subtotal.value_eur,
      ...(subtotal.partial ? { missing: "falta algún precio" } : {}),
    })),
  };
  const bucket: NetWorthBlock = {
    label: "Cubo",
    subtotal: shownSum(view.bucket.rows.map((row) => row.value_eur)),
    partial: view.bucket.partial,
    missing: view.bucket.missing_prices,
    lines: view.bucket.rows.map((row) => ({
      name: row.asset_id,
      ...(row.account_id === undefined ? {} : { detail: row.account_id }),
      ...(row.value_eur === undefined ? { missing: "sin precio" } : { value: row.value_eur }),
    })),
  };
  const cash: NetWorthBlock = {
    label: "Efectivo",
    subtotal: shownSum(view.cash.rows.map((row) => row.value_eur)),
    partial: view.cash.partial,
    missing: view.cash.missing_rates,
    lines: view.cash.rows.map((row) => ({
      name: `${row.account_id} · ${row.currency}`,
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
