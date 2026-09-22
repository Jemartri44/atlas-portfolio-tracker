// Trading statistics and the two control rules of the bucket.
//
// Two things this file is careful about, both of them about honesty:
//
//   - A control rule that could **not be measured** is said to be unmeasured,
//     never "within limits". `bucketStats` returns the reason next to the field
//     that is missing, and that reason is what the screen prints.
//   - The weight of the bucket over total net worth is one of the **two**
//     bounded exceptions to compartmentalisation (constitution III, rule 18). It
//     travels with a label saying so, and the screen shows the breakdown beside
//     it — the exception is a budget control, not a portfolio metric.

import type { BucketControls, BucketReport, BucketStats, Money, Warning } from "@atlas/domain";
import { missingOf } from "../../format/messages/prose.js";
import { displayName, displayThesis, type NameIndex, NO_NAMES } from "../../format/names.js";

export interface StatsView {
  closedTheses: number;
  measuredTheses: number;
  realizedOperations: number;
  excluded: string[];
  hitRatePct?: string;
  averageWin?: Money;
  averageLoss?: Money;
  expectancy?: Money;
  fees: Money;
  tradedCapital: Money;
  feesPct?: string;
  maxDrawdown: Money;
  drawdownFrom?: string;
  drawdownTo?: string;
  vsIndexTotal?: Money;
  vsIndexMissing: number;
  /** The same result as a share of the gross contribution; absent over a partial total. */
  vsIndexPct?: string;
  warnings: readonly Warning[];
}

export interface ControlsView {
  contributionGross: Money;
  contributionNet: Money;
  budget?: Money;
  monthsElapsed?: number;
  realized: Money;
  unrealized?: Money;
  lossPct?: string;
  /** Why the stop-loss rule could not be measured; the screen prints it as is. */
  lossUnavailable?: string;
  weightPct?: string;
  weightUnavailable?: string;
  warnings: readonly Warning[];
}

const REASONS: Record<string, string> = {
  missing_prices: "hay posiciones del cubo sin precio",
  no_contribution: "todavía no hay aporte bruto al cubo sobre el que medir",
  partial_net_worth: "el patrimonio total es parcial",
  no_net_worth: "el patrimonio total no es positivo",
};

const gapText = (
  gap: BucketControls["loss_pct_unavailable"],
  names: NameIndex,
): string | undefined => {
  if (gap === undefined) {
    return undefined;
  }
  const missing = [
    ...(gap.assets ?? []).map((id) => displayName(names, id)),
    ...(gap.currencies ?? []),
  ];
  const detail = missing.length === 0 ? "" : ` (${missingOf(missing)})`;
  return `${REASONS[gap.reason] ?? gap.reason}${detail}`;
};

export const statsView = (stats: BucketStats, names: NameIndex = NO_NAMES): StatsView => ({
  closedTheses: stats.closed_theses,
  measuredTheses: stats.measured_theses,
  realizedOperations: stats.realized_operations,
  excluded: stats.excluded.map((entry) => displayThesis(names, entry.thesis_id)),
  ...(stats.hit_rate === undefined ? {} : { hitRatePct: stats.hit_rate.toString() }),
  ...(stats.average_win_eur === undefined ? {} : { averageWin: stats.average_win_eur }),
  ...(stats.average_loss_eur === undefined ? {} : { averageLoss: stats.average_loss_eur }),
  ...(stats.expectancy_eur === undefined ? {} : { expectancy: stats.expectancy_eur }),
  fees: stats.fees_eur,
  tradedCapital: stats.traded_capital_eur,
  ...(stats.fees_pct === undefined ? {} : { feesPct: stats.fees_pct.toString() }),
  maxDrawdown: stats.max_drawdown_eur,
  ...(stats.drawdown_peak === undefined ? {} : { drawdownFrom: stats.drawdown_peak.date }),
  ...(stats.drawdown_valley === undefined ? {} : { drawdownTo: stats.drawdown_valley.date }),
  ...(stats.vs_index_total_eur === undefined ? {} : { vsIndexTotal: stats.vs_index_total_eur }),
  vsIndexMissing: stats.vs_index_missing,
  ...(stats.vs_index_pct === undefined ? {} : { vsIndexPct: stats.vs_index_pct.toString() }),
  warnings: stats.warnings,
});

export const controlsView = (
  controls: BucketControls,
  names: NameIndex = NO_NAMES,
): ControlsView => ({
  contributionGross: controls.contribution_gross_eur,
  contributionNet: controls.contribution_net_eur,
  ...(controls.budget_eur === undefined ? {} : { budget: controls.budget_eur }),
  ...(controls.months_elapsed === undefined ? {} : { monthsElapsed: controls.months_elapsed }),
  realized: controls.realized_eur,
  ...(controls.unrealized_eur === undefined ? {} : { unrealized: controls.unrealized_eur }),
  ...(controls.loss_pct === undefined ? {} : { lossPct: controls.loss_pct.toString() }),
  ...(gapText(controls.loss_pct_unavailable, names) === undefined
    ? {}
    : { lossUnavailable: gapText(controls.loss_pct_unavailable, names) as string }),
  ...(controls.weight_pct === undefined ? {} : { weightPct: controls.weight_pct.toString() }),
  ...(gapText(controls.weight_pct_unavailable, names) === undefined
    ? {}
    : { weightUnavailable: gapText(controls.weight_pct_unavailable, names) as string }),
  warnings: controls.warnings,
});

export const bucketReportView = (
  report: BucketReport,
  names: NameIndex = NO_NAMES,
): { stats: StatsView; controls: ControlsView } => ({
  stats: statsView(report.stats, names),
  controls: controlsView(report.controls, names),
});
