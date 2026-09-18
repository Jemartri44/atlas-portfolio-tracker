// atlas networth · atlas bucket
//
// Read-only views of phase 3. Both project with `asOf` when a date is given
// (ADR-0016): the quantities of that day, never today's read with old prices.

import { type CashLine, type NetWorth, netWorth, settingsAt } from "@atlas/domain";
import { assertKnownFlags, type Flags } from "../args.js";
import { type Context, describeWarnings, GLOBAL_FLAGS } from "../context.js";
import { DASH, eur } from "../output/format.js";
import { table } from "../output/table.js";
import { dateFlag, loadForQuery, renderQuery } from "./shared.js";

const PARTIAL = "(parcial)";

const warningLines = (warnings: readonly { code: string }[]): string[] =>
  warnings.length === 0
    ? []
    : ["", "Avisos:", ...describeWarnings(warnings as Parameters<typeof describeWarnings>[0])];

/** The age of a rate, with the caducity mark and where its date comes from. */
const rateCell = (row: CashLine): string[] =>
  row.fx_rate === undefined
    ? [DASH, DASH, DASH]
    : [
        row.fx_rate.rate.toString(),
        `${row.fx_rate.date}${row.fx_rate_dated === true ? "" : " (fecha de la operación)"}`,
        `${row.fx_age_days ?? 0}${row.fx_stale === true ? " ⚠" : ""}`,
      ];

export const netWorthText = (view: NetWorth): string => {
  const missing = [
    ...view.core.missing_prices,
    ...view.bucket.missing_prices,
    ...view.cash.missing_rates,
  ];
  return [
    `Patrimonio total a ${view.date} (siempre desglosado: el núcleo y el cubo no se suman en ninguna otra métrica).`,
    "",
    "Núcleo:",
    ...view.core.by_class.map(
      (subtotal) =>
        `  [${subtotal.asset_class}]  ${eur(subtotal.value_eur)} EUR${subtotal.partial ? `  ${PARTIAL}` : ""}`,
    ),
    `  Subtotal  ${eur(view.core.total_eur)} EUR${view.core.partial ? `  ${PARTIAL}` : ""}`,
    "",
    "Cubo:",
    ...view.bucket.rows.map(
      (row) =>
        `  ${row.account_id} / ${row.asset_id}  ${eur(row.value_eur)} EUR${row.value_eur === undefined ? "  (sin precio)" : ""}`,
    ),
    `  Subtotal  ${eur(view.bucket.total_eur)} EUR${view.bucket.partial ? `  ${PARTIAL}` : ""}`,
    "",
    "Efectivo:",
    table(
      ["cuenta", "divisa", "saldo", "tipo BCE", "tipo de", "antigüedad", "valor EUR"],
      [
        ...view.cash.rows.map((row) => [
          row.account_id,
          row.currency,
          row.balance.amount.toString(),
          ...rateCell(row),
          row.value_eur === undefined ? "— (sin convertir)" : eur(row.value_eur),
        ]),
        ["Subtotal", "", "", "", "", "", eur(view.cash.total_eur)],
      ],
    ),
    "",
    `TOTAL${view.partial ? ` ${PARTIAL}` : ""}  ${eur(view.total_eur)} EUR`,
    ...(missing.length === 0 ? [] : [`Faltan: ${missing.join(", ")}.`]),
    ...warningLines(view.warnings),
  ].join("\n");
};

const jsonNetWorth = (view: NetWorth) => ({
  date: view.date,
  partial: view.partial,
  total_eur: view.total_eur.amount.toString(),
  core: {
    total_eur: view.core.total_eur.amount.toString(),
    partial: view.core.partial,
    missing_prices: view.core.missing_prices,
    by_class: view.core.by_class.map((subtotal) => ({
      asset_class: subtotal.asset_class,
      value_eur: subtotal.value_eur.amount.toString(),
      partial: subtotal.partial,
    })),
  },
  bucket: {
    total_eur: view.bucket.total_eur.amount.toString(),
    partial: view.bucket.partial,
    missing_prices: view.bucket.missing_prices,
    rows: view.bucket.rows.map((row) => ({
      account_id: row.account_id,
      asset_id: row.asset_id,
      value_eur: row.value_eur?.amount.toString(),
    })),
  },
  cash: {
    total_eur: view.cash.total_eur.amount.toString(),
    partial: view.cash.partial,
    missing_rates: view.cash.missing_rates,
    rows: view.cash.rows.map((row) => ({
      account_id: row.account_id,
      currency: row.currency,
      balance: row.balance.amount.toString(),
      fx_rate: row.fx_rate?.rate.toString(),
      fx_rate_date: row.fx_rate?.date,
      fx_rate_dated: row.fx_rate_dated,
      fx_age_days: row.fx_age_days,
      fx_stale: row.fx_stale,
      value_eur: row.value_eur?.amount.toString(),
    })),
  },
  warnings: view.warnings,
});

export const netWorthCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["date", ...GLOBAL_FLAGS]);
  const date = dateFlag(ctx, flags);
  const { state } = await loadForQuery(ctx, date);
  const view = netWorth(state, date, settingsAt(state, date).settings);
  renderQuery(ctx, state, jsonNetWorth(view), netWorthText(view));
  return 0;
};
