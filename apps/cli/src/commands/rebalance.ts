// atlas rebalance [--amount <eur>] [--date]
//
// A proposal and nothing else: it writes nothing, and the orders are placed by
// hand on each platform and recorded as always. The steps come in the order the
// owner would choose them: new money first, then transfers between funds (no
// tax), then sales, each with its estimated tax and commissions.

import { settingsAt, type Warning } from "@atlas/domain";
import {
  type RebalancePlan,
  type RebalanceStep,
  rebalancePlan,
  type SaleStep,
  type SaleTax,
} from "@atlas/domain/rebalance";
import { assertKnownFlags, type Flags, stringFlag } from "../args.js";
import { type Context, describeWarnings, GLOBAL_FLAGS } from "../context.js";
import { eur, pct, pp } from "../output/format.js";
import { platformJson, platformLines } from "../output/platforms.js";
import { table } from "../output/table.js";
import { loadQuotes, sayNotes } from "../prices/load.js";
import { dateFlag, loadForQuery, renderQuery } from "./shared.js";

const taxText = (tax: SaleTax): string[] => {
  if (!tax.available) {
    return [
      `   Impuesto: no se puede estimar (${tax.code}). Decide sin esa cifra o repara primero lo que dice.`,
    ];
  }
  return [
    tax.tax_eur === undefined
      ? "   Impuesto: no calculable, faltan los tramos de la base del ahorro (`savings_tax_brackets`)."
      : tax.tax_eur.isNegative()
        ? `   Reduce tu impuesto en ≈ ${eur(tax.tax_eur.neg())} EUR: la pérdida de ${eur(tax.gain_eur)} EUR compensa ganancias de este año (estimación al precio de hoy; no es la liquidación).`
        : `   Impuesto aproximado: ${eur(tax.tax_eur)} EUR sobre una ${
            tax.gain_eur.isNegative() ? "pérdida" : "ganancia"
          } de ${eur(tax.gain_eur)} EUR (estimación al precio de hoy; no es la liquidación).`,
    ...tax.lots.map(
      (lot) =>
        `   Lote FIFO de ${lot.acquisition_date}: ${lot.quantity.toString()} uds, coste ${eur(lot.cost_eur)}, ganancia ${eur(lot.gain_eur)}.`,
    ),
    ...(tax.deferred_eur.isZero()
      ? []
      : [
          `   Pérdida diferida por la regla de recompra: ${eur(tax.deferred_eur)} EUR. No recompres este valor antes de ${tax.deferral_window_end ?? "(sin fecha)"} o la pérdida seguirá sin ser deducible.`,
        ]),
  ];
};

const outcomeText = (step: RebalanceStep): string =>
  `   Si te quedas aquí: desviación máxima ${pp(step.outcome.max_deviation_pp)} puntos.`;

const saleText = (step: SaleStep): string[] => [
  ...step.orders.map(
    (order) =>
      `   Vender en ${order.account_id}: ${order.quantity.toString()} uds, ${eur(order.amount_eur)} EUR; comisión ${
        order.fee === undefined
          ? "desconocida"
          : `${eur(order.fee.fee_eur)} EUR (${pct(order.fee_pct)})`
      }.`,
  ),
  ...taxText(step.tax),
  "   Con ese dinero se compra:",
  ...platformLines(step.buys).map((line) => `  ${line}`),
  outcomeText(step),
];

const stepText = (step: RebalanceStep, index: number): string[] => {
  switch (step.kind) {
    case "contribution":
      return [
        `Paso ${index} · SIN IMPUESTOS · dinero nuevo (${eur(step.amount_eur)} EUR para el núcleo)`,
        ...platformLines(step.platforms),
        outcomeText(step),
      ];
    case "transfer":
      return [
        `Paso ${index} · SIN IMPUESTOS · traspaso de ${step.from_asset_id}${
          step.from_account_id === undefined ? "" : ` (${step.from_account_id})`
        } a ${step.to_asset_id}${step.to_account_id === undefined ? " (aún sin cuenta: elige dónde)" : ` (${step.to_account_id})`}: ${eur(step.amount_eur)} EUR, unas ${step.quantity.value.round(4).toString()} participaciones. Conserva fecha y coste; no es una venta seguida de una compra.`,
        outcomeText(step),
      ];
    case "sale":
      return [
        `Paso ${index} · CON IMPUESTOS, DECIDES TÚ · vender ${step.asset_id}: ${eur(step.amount_eur)} EUR`,
        ...saleText(step),
      ];
  }
};

const diagnosisText = (plan: RebalancePlan): string =>
  table(
    ["activo", "clase", "valor EUR", "peso", "objetivo", "desviación", ""],
    plan.diagnosis.map((row) => [
      row.asset_id,
      row.asset_class,
      eur(row.value_eur),
      pct(row.weight_pct),
      pct(row.target_pct),
      pp(row.deviation_pp),
      row.beyond_threshold ? "fuera del umbral" : "",
    ]),
  );

const statusText = (plan: RebalancePlan): string[] => {
  switch (plan.status) {
    case "within_threshold":
      return [
        `Ningún activo supera el umbral de ${pp(plan.threshold_pp)} puntos${
          plan.new_money_eur.amount.isPositive() ? " una vez colocado el dinero nuevo" : ""
        }: no hace falta rebalancear. La regla 3 del plan pide revisar una vez al año.`,
      ];
    case "only_deficits":
      return [
        `Hay activos por debajo de su objetivo más allá del umbral, pero ninguno por encima: no hay nada que traspasar ni vender. Se corrige aportando${
          plan.purchases_only_eur.amount.isPositive()
            ? `; llevar todos al objetivo solo con compras exigiría ${eur(plan.purchases_only_eur)} EUR más`
            : ""
        }.`,
      ];
    case "steps":
      return [];
  }
};

const cashText = (plan: RebalancePlan): string[] =>
  plan.cash.length === 0
    ? []
    : [
        "",
        "Efectivo entre plataformas (positivo: tiene que llegar dinero; negativo: queda libre):",
        table(
          ["cuenta", "plataforma", "compras", "ventas", "comisiones", "neto EUR"],
          plan.cash.map((move) => [
            move.account_id,
            move.platform,
            eur(move.buy_eur),
            eur(move.sell_eur),
            eur(move.fees_eur),
            eur(move.net_eur),
          ]),
        ),
      ];

const rebalanceText = (plan: RebalancePlan): string =>
  [
    `Rebalanceo a ${plan.date} (umbral de ${pp(plan.threshold_pp)} puntos, regla 3). El cubo no entra.`,
    "",
    diagnosisText(plan),
    "",
    ...statusText(plan),
    ...plan.steps.flatMap((step, index) => ["", ...stepText(step, index + 1)]),
    ...cashText(plan),
    ...(plan.warnings.length === 0
      ? []
      : ["", "Avisos:", ...describeWarnings(plan.warnings as Warning[])]),
    "",
    "La propuesta no se ha registrado: da las órdenes en cada plataforma y regístralas con",
    "`atlas add buy|sell` / `atlas transfer`.",
  ].join("\n");

const stepJson = (step: RebalanceStep) => {
  const outcome = { max_deviation_pp: step.outcome.max_deviation_pp.toString() };
  switch (step.kind) {
    case "contribution":
      return {
        kind: step.kind,
        amount_eur: step.amount_eur.amount.toString(),
        platforms: platformJson(step.platforms),
        ...outcome,
      };
    case "transfer":
      return {
        kind: step.kind,
        from_asset_id: step.from_asset_id,
        to_asset_id: step.to_asset_id,
        amount_eur: step.amount_eur.amount.toString(),
        quantity: step.quantity.toString(),
        ...(step.from_account_id === undefined ? {} : { from_account_id: step.from_account_id }),
        ...(step.to_account_id === undefined ? {} : { to_account_id: step.to_account_id }),
        ...outcome,
      };
    case "sale":
      return {
        kind: step.kind,
        asset_id: step.asset_id,
        amount_eur: step.amount_eur.amount.toString(),
        orders: step.orders.map((order) => ({
          account_id: order.account_id,
          quantity: order.quantity.toString(),
          amount_eur: order.amount_eur.amount.toString(),
          ...(order.fee === undefined
            ? {}
            : { fee_eur: order.fee.fee_eur.amount.toString(), fee_as_of: order.fee.as_of }),
          ...(order.fee_pct === undefined ? {} : { fee_pct: order.fee_pct.toString() }),
        })),
        tax: step.tax.available
          ? {
              available: true,
              ...(step.tax.tax_eur === undefined
                ? {}
                : { tax_eur: step.tax.tax_eur.amount.toString() }),
              gain_eur: step.tax.gain_eur.amount.toString(),
              cost_eur: step.tax.cost_eur.amount.toString(),
              deferred_eur: step.tax.deferred_eur.amount.toString(),
              ...(step.tax.deferral_window_end === undefined
                ? {}
                : { deferral_window_end: step.tax.deferral_window_end }),
              lots: step.tax.lots.map((lot) => ({
                lot_id: lot.lot_id,
                acquisition_date: lot.acquisition_date,
                quantity: lot.quantity.toString(),
                cost_eur: lot.cost_eur.amount.toString(),
                gain_eur: lot.gain_eur.amount.toString(),
              })),
            }
          : { available: false, code: step.tax.code },
        buys: platformJson(step.buys),
        ...outcome,
      };
  }
};

export const rebalanceCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["amount", "date", ...GLOBAL_FLAGS]);
  const date = dateFlag(ctx, flags);
  const { state, events } = await loadForQuery(ctx, date);
  const amount = stringFlag(flags, "amount");
  const quotes = await loadQuotes(ctx, state);
  const plan = rebalancePlan(state, events, {
    date,
    settings: settingsAt(state, date).settings,
    ...(amount === undefined ? {} : { amount }),
    ...(quotes.external === undefined ? {} : { external: quotes.external }),
  });
  sayNotes(ctx, quotes.notes);
  renderQuery(
    ctx,
    state,
    {
      date: plan.date,
      threshold_pp: plan.threshold_pp.toString(),
      core_value_eur: plan.core_value_eur.amount.toString(),
      new_money_eur: plan.new_money_eur.amount.toString(),
      status: plan.status,
      purchases_only_eur: plan.purchases_only_eur.amount.toString(),
      diagnosis: plan.diagnosis.map((row) => ({
        asset_id: row.asset_id,
        asset_class: row.asset_class,
        value_eur: row.value_eur.amount.toString(),
        weight_pct: row.weight_pct.toString(),
        target_pct: row.target_pct.toString(),
        deviation_pp: row.deviation_pp.toString(),
        beyond_threshold: row.beyond_threshold,
      })),
      steps: plan.steps.map(stepJson),
      cash: plan.cash.map((move) => ({
        account_id: move.account_id,
        platform: move.platform,
        buy_eur: move.buy_eur.amount.toString(),
        sell_eur: move.sell_eur.amount.toString(),
        fees_eur: move.fees_eur.amount.toString(),
        net_eur: move.net_eur.amount.toString(),
      })),
      warnings: plan.warnings,
    },
    rebalanceText(plan),
  );
  return 0;
};
