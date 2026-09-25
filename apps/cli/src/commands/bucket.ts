// atlas networth · atlas bucket
//
// Read-only views of phase 3. Both project with `asOf` when a date is given
// (ADR-0016): the quantities of that day, never today's read with old prices.

import {
  type BucketControls,
  type BucketPositions,
  type BucketStats,
  type BucketThesisView,
  bucketPositions,
  bucketStats,
  bucketTheses,
  type CashLine,
  Money,
  type NetWorth,
  netWorth,
  settingsAt,
  type Warning,
} from "@atlas/domain";
import { assertKnownFlags, type Flags } from "../args.js";
import { type Context, describeWarnings, GLOBAL_FLAGS } from "../context.js";
import { DASH, eur, pct } from "../output/format.js";
import { PRICE_HEADERS, priceColumns, priceJson, priceNotes } from "../output/prices.js";
import { table } from "../output/table.js";
import { loadQuotes, sayNotes } from "../prices/load.js";
import { dateFlag, loadForQuery, renderQuery } from "./shared.js";
import { jsonThesis } from "./thesis.js";

const PARTIAL = "(parcial)";

const warningLines = (warnings: readonly Warning[]): string[] =>
  warnings.length === 0 ? [] : ["", "Avisos:", ...describeWarnings(warnings)];

/** The age of a rate, with the caducity mark and where its date comes from. */
const rateCell = (row: CashLine): string[] =>
  row.fx_rate === undefined
    ? [DASH, DASH, DASH]
    : [
        row.fx_rate.rate.toString(),
        `${row.fx_rate.date}${row.fx_rate_dated === true ? "" : " (fecha de la operación)"}`,
        `${row.fx_age_days ?? 0}${row.fx_stale === true ? " ⚠" : ""}`,
      ];

/**
 * In the one view whose mandate is to stay broken down, the printed total is
 * the sum of the printed figures: a reader who adds the column has to get the
 * number at the bottom. The exact, unrounded value is still in `--json`. The
 * rule lives in the domain, so the web prints the same total.
 */
const shownSum = (values: readonly (Money | undefined)[]): Money => Money.sumShown(values, "EUR");

export const netWorthText = (view: NetWorth): string => {
  const missing = [
    ...view.core.missing_prices,
    ...view.bucket.missing_prices,
    ...view.cash.missing_rates,
  ];
  const core = shownSum(view.core.by_class.map((subtotal) => subtotal.value_eur));
  const bucket = shownSum(view.bucket.rows.map((row) => row.value_eur));
  const cash = shownSum(view.cash.rows.map((row) => row.value_eur));
  return [
    `Patrimonio total a ${view.date} (siempre desglosado: el núcleo y el cubo no se suman en ninguna otra métrica).`,
    "",
    "Núcleo:",
    ...view.core.by_class.map(
      (subtotal) =>
        `  [${subtotal.asset_class}]  ${eur(subtotal.value_eur)} EUR${subtotal.partial ? `  ${PARTIAL}` : ""}`,
    ),
    `  Subtotal  ${eur(core)} EUR${view.core.partial ? `  ${PARTIAL}` : ""}`,
    "",
    "Cubo:",
    ...view.bucket.rows.map(
      (row) =>
        `  ${row.account_id} / ${row.asset_id}  ${eur(row.value_eur)} EUR${row.value_eur === undefined ? "  (sin precio)" : ""}`,
    ),
    `  Subtotal  ${eur(bucket)} EUR${view.bucket.partial ? `  ${PARTIAL}` : ""}`,
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
        ["Subtotal", "", "", "", "", "", eur(cash)],
      ],
    ),
    "",
    `TOTAL${view.partial ? ` ${PARTIAL}` : ""}  ${eur(core.add(bucket).add(cash))} EUR`,
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
  const quotes = await loadQuotes(ctx, state);
  sayNotes(ctx, quotes.notes);
  const view = netWorth(state, date, settingsAt(state, date).settings, quotes.external);
  renderQuery(ctx, state, jsonNetWorth(view), netWorthText(view));
  return 0;
};

/** Positions: what is open, what it cost, what it is worth and what it said it would do. */
const positionsText = (view: BucketPositions): string[] => [
  "Posiciones abiertas:",
  table(
    [
      "cuenta",
      "activo",
      "cantidad",
      "coste medio",
      ...PRICE_HEADERS,
      "valor EUR",
      "P&L EUR",
      "P&L %",
      "tesis",
      "días",
      "plazo",
      "invalidación",
    ],
    view.rows.map((row) => [
      row.account_id,
      row.asset_id,
      row.quantity.toString(),
      eur(row.unit_cost_eur),
      ...priceColumns(row.price),
      eur(row.value_eur),
      eur(row.unrealized_eur),
      pct(row.unrealized_pct),
      row.thesis_id ?? "",
      row.days_open === undefined ? "" : String(row.days_open),
      row.expected_horizon_days === undefined
        ? ""
        : `${row.expected_horizon_days}${row.horizon_exceeded === true ? " ⚠" : ""}`,
      row.invalidation ?? "",
    ]),
  ),
  `  Total: ${eur(view.total_value_eur)} EUR de valor${view.partial ? ` ${PARTIAL}` : ""}, ${eur(view.total_cost_eur)} EUR de coste`,
  ...priceNotes(view.rows.map((row) => row.price)),
];

/** Theses: the result of each bet and, above all, what the boring alternative would have done. */
const thesesText = (rows: readonly BucketThesisView[]): string[] => [
  "Tesis:",
  table(
    [
      "tesis",
      "estado",
      "activo",
      "invertido EUR",
      "resultado EUR",
      "latente EUR",
      "equiv. índice EUR",
      "vs índice EUR",
      "días",
    ],
    rows.map((thesis) => [
      thesis.thesis_id,
      thesis.status === "open" ? "abierta" : "cerrada",
      thesis.asset_id,
      eur(thesis.invested_eur),
      eur(thesis.result_eur_rounded),
      eur(thesis.unrealized_eur),
      eur(thesis.benchmark_equivalent_eur),
      eur(thesis.result_vs_index_eur),
      String(thesis.days_open),
    ]),
  ),
];

/** Statistics, with the commissions over traded capital where they cannot be missed (rule 14). */
const statsText = (stats: BucketStats): string[] => [
  `Estadísticas (${stats.closed_theses} tesis cerradas, ${stats.measured_theses} medidas; ${stats.realized_operations} operaciones realizadas):`,
  "",
  `  COMISIONES SOBRE CAPITAL OPERADO:  ${eur(stats.fees_eur)} / ${eur(stats.traded_capital_eur)} EUR = ${pct(stats.fees_pct)}`,
  "",
  `  Tasa de acierto     ${pct(stats.hit_rate)}`,
  `  Ganancia media      ${eur(stats.average_win_eur)} EUR`,
  `  Pérdida media       ${eur(stats.average_loss_eur)} EUR`,
  `  Esperanza por tesis ${eur(stats.expectancy_eur)} EUR`,
  `  Máxima caída        ${eur(stats.max_drawdown_eur)} EUR${
    stats.drawdown_peak === undefined
      ? ""
      : ` (de ${stats.drawdown_peak.date} a ${stats.drawdown_valley?.date})`
  }`,
  `  Resultado vs índice ${eur(stats.vs_index_total_eur)} EUR (${stats.vs_index_missing} tesis sin dato)`,
];

/** Control rules: how much went in, how much is at risk, how much it weighs. */
const controlsText = (controls: BucketControls): string[] => [
  "Control del cubo:",
  `  Aporte bruto        ${eur(controls.contribution_gross_eur)} EUR   (neto ${eur(controls.contribution_net_eur)} EUR)`,
  `  Presupuesto previsto ${eur(controls.budget_eur)} EUR${
    controls.months_elapsed === undefined ? "" : `  (${controls.months_elapsed} meses)`
  }`,
  `  Resultado realizado ${eur(controls.realized_eur)} EUR   latente ${eur(controls.unrealized_eur)} EUR`,
  `  Peso sobre el patrimonio ${pct(controls.weight_pct)}`,
];

const jsonBucket = (
  date: string,
  positions: BucketPositions,
  theses: readonly BucketThesisView[],
  stats: BucketStats,
  controls: BucketControls,
) => ({
  date,
  positions: {
    partial: positions.partial,
    missing_prices: positions.missing_prices,
    total_value_eur: positions.total_value_eur.amount.toString(),
    total_cost_eur: positions.total_cost_eur.amount.toString(),
    rows: positions.rows.map((row) => ({
      account_id: row.account_id,
      asset_id: row.asset_id,
      quantity: row.quantity.toString(),
      unit_cost_eur: row.unit_cost_eur?.amount.toString(),
      cost_eur: row.cost_eur?.amount.toString(),
      price: priceJson(row.price),
      value_eur: row.value_eur?.amount.toString(),
      unrealized_eur: row.unrealized_eur?.amount.toString(),
      unrealized_pct: row.unrealized_pct?.toString(),
      thesis_id: row.thesis_id,
      days_open: row.days_open,
      expected_horizon_days: row.expected_horizon_days,
      horizon_exceeded: row.horizon_exceeded,
      invalidation: row.invalidation,
    })),
  },
  theses: theses.map(jsonThesis),
  stats: {
    closed_theses: stats.closed_theses,
    measured_theses: stats.measured_theses,
    realized_operations: stats.realized_operations,
    excluded: stats.excluded,
    hit_rate: stats.hit_rate?.toString(),
    average_win_eur: stats.average_win_eur?.amount.toString(),
    average_loss_eur: stats.average_loss_eur?.amount.toString(),
    expectancy_eur: stats.expectancy_eur?.amount.toString(),
    fees_eur: stats.fees_eur.amount.toString(),
    traded_capital_eur: stats.traded_capital_eur.amount.toString(),
    fees_pct: stats.fees_pct?.toString(),
    max_drawdown_eur: stats.max_drawdown_eur.amount.toString(),
    drawdown_peak: stats.drawdown_peak && {
      date: stats.drawdown_peak.date,
      cumulative_eur: stats.drawdown_peak.cumulative_eur.amount.toString(),
    },
    drawdown_valley: stats.drawdown_valley && {
      date: stats.drawdown_valley.date,
      cumulative_eur: stats.drawdown_valley.cumulative_eur.amount.toString(),
    },
    vs_index_total_eur: stats.vs_index_total_eur?.amount.toString(),
    vs_index_missing: stats.vs_index_missing,
    warnings: stats.warnings,
  },
  controls: {
    contribution_gross_eur: controls.contribution_gross_eur.amount.toString(),
    contribution_net_eur: controls.contribution_net_eur.amount.toString(),
    budget_eur: controls.budget_eur?.amount.toString(),
    months_elapsed: controls.months_elapsed,
    realized_eur: controls.realized_eur.amount.toString(),
    unrealized_eur: controls.unrealized_eur?.amount.toString(),
    loss_pct: controls.loss_pct?.toString(),
    loss_pct_unavailable: controls.loss_pct_unavailable,
    weight_pct: controls.weight_pct?.toString(),
    weight_pct_unavailable: controls.weight_pct_unavailable,
    warnings: controls.warnings,
  },
});

export const bucketCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["date", ...GLOBAL_FLAGS]);
  const date = dateFlag(ctx, flags);
  const { state, events } = await loadForQuery(ctx, date);
  const settings = settingsAt(state, date).settings;
  const quotes = await loadQuotes(ctx, state);
  sayNotes(ctx, quotes.notes);
  const positions = bucketPositions(state, date, settings, quotes.external);
  const { rows: theses, warnings: benchmark } = bucketTheses(
    state,
    date,
    settings,
    quotes.external,
  );
  const { stats, controls } = bucketStats(state, events, date, settings, date, quotes.external);
  const stopLoss = controls.warnings.filter(
    (warning) => warning.code === "bucket_stop_loss_reached",
  );
  const text = [
    `Cubo especulativo a ${date} (precios informativos, nunca fiscales; gana el más reciente, y con la misma fecha el manual).`,
    // The stop-loss goes at the top, not in a corner: it is the rule the plan
    // wants hardest to ignore (rule 17). It warns; it never blocks (decision (f)).
    ...(stopLoss.length === 0 ? [] : ["", ...describeWarnings(stopLoss)]),
    "",
    ...positionsText(positions),
    "",
    ...thesesText(theses),
    "",
    ...statsText(stats),
    "",
    ...controlsText(controls),
    ...warningLines([...positions.warnings, ...benchmark, ...stats.warnings, ...controls.warnings]),
  ].join("\n");
  renderQuery(ctx, state, jsonBucket(date, positions, theses, stats, controls), text);
  return 0;
};
