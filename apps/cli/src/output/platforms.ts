// How the per-platform plan reads in the console (feature 028): the same lines
// for the monthly contribution and for each purchase of a rebalance, so the two
// can never word the same thing differently.

import type { FeeEstimate, PlatformPlan, PlatformRow } from "@atlas/domain/portfolio";
import { eur, pct } from "./format.js";
import { table } from "./table.js";

/** Where a commission comes from, in the words the owner would use. */
const basisText = (fee: FeeEstimate): string =>
  `${fee.basis === "same_asset" ? "como tu última operación de este activo" : "como tu última operación de este tipo de activo"}, ${fee.as_of}`;

const feeCell = (line: PlatformRow["lines"][number]): string =>
  line.fee === undefined
    ? "desconocida"
    : `${eur(line.fee.fee_eur)} (${pct(line.fee_pct)}; ${basisText(line.fee)})`;

const rowText = (row: PlatformRow): string[] => [
  `  ${row.account_id} (${row.platform}): comprar ${eur(row.buy_eur)} EUR · efectivo ${
    row.cash_eur === undefined ? "en otra divisa, sin convertir" : `${eur(row.cash_eur)} EUR`
  } · comisiones ${eur(row.fees_eur)} EUR · INGRESAR ${eur(row.deposit_eur)} EUR`,
  table(
    ["activo", "importe EUR", "comisión estimada"],
    row.lines.map((line) => [line.asset_id, eur(line.amount_eur), feeCell(line)]),
  )
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n"),
  ...(row.cash_negative
    ? [
        "    El efectivo del libro es negativo (faltan ingresos por registrar): se pide solo lo que se compra.",
      ]
    : []),
  ...(row.unknown_fee_assets.length === 0
    ? []
    : [
        `    Sin comisión conocida para ${row.unknown_fee_assets.join(", ")}: el ingreso puede quedarse corto.`,
      ]),
  ...(row.costliest_asset_id === undefined
    ? []
    : [`    La comisión más pesada sobre su importe es la de ${row.costliest_asset_id}.`]),
];

/** The lines of a plan per platform; empty when there is nothing to buy anywhere. */
export const platformLines = (plan: PlatformPlan): string[] => [
  ...plan.rows.flatMap(rowText),
  ...plan.unassigned.map(
    (order) =>
      `  SIN PLATAFORMA: ${order.asset_id}, ${eur(order.amount_eur)} EUR. No está en ninguna cuenta activa del núcleo; elige una de ${
        order.candidates.join(", ") || "(ninguna)"
      } y regístralo allí.`,
  ),
];

export const platformJson = (plan: PlatformPlan) => ({
  rows: plan.rows.map((row) => ({
    account_id: row.account_id,
    platform: row.platform,
    buy_eur: row.buy_eur.amount.toString(),
    fees_eur: row.fees_eur.amount.toString(),
    ...(row.cash_eur === undefined ? {} : { cash_eur: row.cash_eur.amount.toString() }),
    foreign_currency: row.foreign_currency,
    cash_negative: row.cash_negative,
    deposit_eur: row.deposit_eur.amount.toString(),
    unknown_fee_assets: row.unknown_fee_assets,
    ...(row.costliest_asset_id === undefined ? {} : { costliest_asset_id: row.costliest_asset_id }),
    lines: row.lines.map((line) => ({
      asset_id: line.asset_id,
      amount_eur: line.amount_eur.amount.toString(),
      ...(line.fee === undefined
        ? {}
        : {
            fee_eur: line.fee.fee_eur.amount.toString(),
            fee_basis: line.fee.basis,
            fee_as_of: line.fee.as_of,
          }),
      ...(line.fee_pct === undefined ? {} : { fee_pct: line.fee_pct.toString() }),
    })),
  })),
  unassigned: plan.unassigned.map((order) => ({
    asset_id: order.asset_id,
    amount_eur: order.amount_eur.amount.toString(),
    candidates: order.candidates,
  })),
});
