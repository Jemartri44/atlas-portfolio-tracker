// atlas weights · contribute · costs
//
// Read-only commands of phase 2. None of them writes: the contribution is a
// proposal, the orders are placed by hand and recorded as always (decision (h)
// of prompt 004).

import {
  type ContributionPlan,
  type CoreWeights,
  contributionPlan,
  coreWeights,
  costSummary,
  Decimal,
  type PriceLookup,
  settingsAt,
  type Warning,
} from "@atlas/domain";
import { assertKnownFlags, type Flags, stringFlag } from "../args.js";
import { type Context, describeWarnings, GLOBAL_FLAGS } from "../context.js";
import { eur, pct, pp } from "../output/format.js";
import { table } from "../output/table.js";
import { dateFlag, loadForQuery, renderQuery } from "./shared.js";

const priceCell = (price: PriceLookup | undefined): string[] =>
  price === undefined
    ? ["sin precio", "", "", "", ""]
    : [
        price.unit_value.toString(),
        price.currency,
        price.fx_rate.toString(),
        price.date,
        `${price.age_days}${price.stale ? " ⚠" : ""}`,
      ];

/** Warnings at the foot of the table, in the one format the CLI uses for them. */
const warningLines = (warnings: readonly Warning[]): string[] =>
  warnings.length === 0 ? [] : ["", "Avisos:", ...describeWarnings(warnings)];

const PARTIAL = "(parcial)";

/**
 * Weight of the whole core: what the rows actually add up to, never a fixed
 * 100 %. With target weights and nothing bought, every row says 0 % and the
 * foot must not claim a full portfolio (constitution V).
 */
const totalWeightCell = (weights: CoreWeights): string => {
  if (weights.partial) {
    return PARTIAL;
  }
  const summed = weights.rows.reduce(
    (total, row) => total.add(row.weight_pct ?? Decimal.ZERO),
    Decimal.ZERO,
  );
  return summed.isZero() ? "" : pct(summed);
};

export const weightsText = (weights: CoreWeights): string => {
  const rows = weights.rows.map((row) => [
    row.asset_id,
    row.asset_class,
    row.quantity.toString(),
    ...priceCell(row.price),
    eur(row.value_eur),
    pct(row.weight_pct),
    pct(row.target_pct),
    pp(row.deviation_pp),
  ]);
  const subtotals = weights.by_class.map((subtotal) => [
    `[${subtotal.asset_class}]`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    eur(subtotal.value_eur),
    subtotal.partial ? PARTIAL : pct(subtotal.weight_pct),
    pct(subtotal.target_pct),
    pp(subtotal.deviation_pp),
  ]);
  return [
    `Pesos del núcleo a ${weights.date} (precios manuales; informativos, nunca fiscales):`,
    table(
      [
        "activo",
        "clase",
        "cantidad",
        "precio",
        "divisa",
        "tipo BCE",
        "precio de",
        "antigüedad",
        "valor EUR",
        "peso",
        "objetivo",
        "desv. pp",
      ],
      [
        ...rows,
        ...subtotals,
        [
          "TOTAL",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          eur(weights.total_eur),
          totalWeightCell(weights),
          "",
          "",
        ],
      ],
    ),
    ...warningLines(weights.warnings),
  ].join("\n");
};

const jsonWeights = (weights: CoreWeights) => ({
  date: weights.date,
  partial: weights.partial,
  total_eur: weights.total_eur.amount.toString(),
  missing_prices: weights.missing_prices,
  stale_prices: weights.stale_prices,
  rows: weights.rows.map((row) => ({
    asset_id: row.asset_id,
    asset_class: row.asset_class,
    quantity: row.quantity.toString(),
    unit_value: row.price?.unit_value.toString(),
    currency: row.price?.currency,
    fx_rate: row.price?.fx_rate.toString(),
    price_date: row.price?.date,
    price_age_days: row.price?.age_days,
    price_stale: row.price?.stale,
    value_eur: row.value_eur?.amount.toString(),
    weight_pct: row.weight_pct?.toString(),
    target_pct: row.target_pct.toString(),
    deviation_pp: row.deviation_pp?.toString(),
  })),
  by_class: weights.by_class.map((subtotal) => ({
    asset_class: subtotal.asset_class,
    value_eur: subtotal.value_eur.amount.toString(),
    partial: subtotal.partial,
    weight_pct: subtotal.weight_pct?.toString(),
    target_pct: subtotal.target_pct.toString(),
    deviation_pp: subtotal.deviation_pp?.toString(),
  })),
  warnings: weights.warnings,
});

export const weightsCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["date", ...GLOBAL_FLAGS]);
  const date = dateFlag(ctx, flags);
  const { state } = await loadForQuery(ctx, date);
  const weights = coreWeights(state, date, settingsAt(state, date).settings);
  renderQuery(ctx, state, jsonWeights(weights), weightsText(weights));
  return 0;
};

const contributionText = (plan: ContributionPlan): string =>
  [
    `Aportación de ${eur(plan.amount_eur)} EUR a ${plan.date} (importe de ${
      plan.amount_origin === "flag" ? "--amount" : "monthly_contribution_eur"
    }):`,
    "",
    `  Presupuesto del cubo:   ${eur(plan.bucket_budget_eur)} EUR   — se ejecuta a mano; la app no elige valores del cubo`,
    `  A repartir en el núcleo: ${eur(plan.core_amount_eur)} EUR`,
    "",
    table(
      [
        "activo",
        "clase",
        "valor EUR",
        "objetivo EUR",
        "déficit EUR",
        "asignación",
        "valor tras",
        "peso tras",
      ],
      [
        ...plan.rows.map((row) => [
          row.asset_id,
          row.asset_class,
          eur(row.value_eur),
          eur(row.target_eur),
          eur(row.gap_eur),
          eur(row.allocation_eur),
          eur(row.value_after_eur),
          pct(row.weight_after_pct),
        ]),
        ["TOTAL", "", "", "", "", eur(plan.core_amount_eur), "", ""],
      ],
    ),
    ...warningLines(plan.warnings),
    "",
    "La propuesta no se ha registrado: da las órdenes en la plataforma y regístralas con",
    "`atlas order place` / `atlas add buy`.",
  ].join("\n");

export const contributeCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["amount", "date", ...GLOBAL_FLAGS]);
  const date = dateFlag(ctx, flags);
  const { state } = await loadForQuery(ctx, date);
  const amount = stringFlag(flags, "amount");
  const plan = contributionPlan(state, {
    ...(amount === undefined ? {} : { amount }),
    date,
    settings: settingsAt(state, date).settings,
  });
  renderQuery(
    ctx,
    state,
    {
      date: plan.date,
      amount_eur: plan.amount_eur.amount.toString(),
      amount_origin: plan.amount_origin,
      bucket_budget_eur: plan.bucket_budget_eur.amount.toString(),
      core_amount_eur: plan.core_amount_eur.amount.toString(),
      core_value_eur: plan.core_value_eur.amount.toString(),
      surplus_distributed: plan.surplus_distributed,
      rows: plan.rows.map((row) => ({
        asset_id: row.asset_id,
        asset_class: row.asset_class,
        target_pct: row.target_pct.toString(),
        value_eur: row.value_eur.amount.toString(),
        target_eur: row.target_eur.amount.toString(),
        gap_eur: row.gap_eur.amount.toString(),
        allocation_eur: row.allocation_eur.amount.toString(),
        value_after_eur: row.value_after_eur.amount.toString(),
        weight_after_pct: row.weight_after_pct.toString(),
      })),
      warnings: plan.warnings,
    },
    contributionText(plan),
  );
  return 0;
};

export const costsCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["date", ...GLOBAL_FLAGS]);
  const date = dateFlag(ctx, flags);
  const { state, events } = await loadForQuery(ctx, date);
  const summary = costSummary(state, events, date, settingsAt(state, date).settings, date);
  const { rows, totals } = summary.core;
  const text = [
    `Costes a ${date}.`,
    "",
    "Núcleo:",
    table(
      ["activo", "clase", "comisiones EUR", "% invertido", "TER %", "valor EUR", "coste anual EUR"],
      [
        ...rows.map((row) => [
          row.asset_id,
          row.asset_class,
          eur(row.fees_eur),
          row.fees_pct === undefined ? "" : row.fees_pct.round(4).toString(),
          row.ter === undefined ? "" : row.ter.toString(),
          eur(row.value_eur),
          eur(row.annual_cost_eur),
        ]),
        [
          "TOTAL",
          totals.partial ? PARTIAL : "",
          eur(totals.fees_eur),
          "",
          totals.weighted_ter === undefined ? "" : totals.weighted_ter.round(4).toString(),
          eur(totals.value_eur),
          eur(totals.annual_cost_eur),
        ],
      ],
    ),
    ...(totals.partial
      ? ["", "El agregado solo cubre la parte del núcleo con precio: faltan valoraciones."]
      : []),
    "",
    "Cubo (comisiones acumuladas por cuenta; la métrica de la regla 14 llega en la Fase 3):",
    table(
      ["cuenta", "comisiones EUR"],
      summary.bucket.rows.map((row) => [row.account_id, eur(row.fees_eur)]),
    ),
  ].join("\n");
  renderQuery(
    ctx,
    state,
    {
      date,
      core: {
        rows: rows.map((row) => ({
          asset_id: row.asset_id,
          asset_class: row.asset_class,
          fees_eur: row.fees_eur.amount.toString(),
          invested_eur: row.invested_eur.amount.toString(),
          fees_pct: row.fees_pct?.toString(),
          ter: row.ter?.toString(),
          value_eur: row.value_eur?.amount.toString(),
          annual_cost_eur: row.annual_cost_eur?.amount.toString(),
        })),
        totals: {
          fees_eur: totals.fees_eur.amount.toString(),
          invested_eur: totals.invested_eur.amount.toString(),
          value_eur: totals.value_eur.amount.toString(),
          weighted_ter: totals.weighted_ter?.toString(),
          annual_cost_eur: totals.annual_cost_eur?.amount.toString(),
          partial: totals.partial,
        },
      },
      bucket: {
        rows: summary.bucket.rows.map((row) => ({
          account_id: row.account_id,
          fees_eur: row.fees_eur.amount.toString(),
        })),
      },
    },
    text,
  );
  return 0;
};
