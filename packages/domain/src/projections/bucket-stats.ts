// Trading statistics of the bucket and its control rules (specification §6.2,
// business rules 14, 16, 17 and 18).
//
// Two ideas govern this file. The unit of decision is the **thesis**, not the
// FIFO operation (decision (d) of prompt 005): the user decided once, bought
// perhaps twice and sold perhaps twice, and that is one bet. And a figure that
// cannot be measured honestly is **excluded and counted**, never averaged in
// (decision (k)): the global FIFO can hand a thesis lots another thesis bought,
// and averaging that is worse than having no average at all.

import type { CivilDate } from "../dates/civil-date.js";
import { Decimal } from "../money/decimal.js";
import { FxRate } from "../money/fx-rate.js";
import { Money } from "../money/money.js";
import type { Currency } from "../money/money.js";
import type { AccountId, AssetId, LedgerEvent } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import {
  type BucketThesisView,
  bucketAccountIds,
  bucketPositions,
  bucketTheses,
  lotIndexOf,
  rootEventOf,
  warn,
} from "./bucket.js";
import { costSummary } from "./costs.js";
import { netWorth } from "./networth.js";
import type { ExternalPrices } from "./prices.js";
import { businessDateOf, isOperationEvent } from "./project-ledger.js";
import type { FiscalLot, LedgerState, RealizedGain, Warning } from "./state.js";

const EUR = "EUR";
const HUNDRED = Decimal.parse("100");
/** Below this many closed theses, the sample says nothing (specification §6.2). */
const SIGNIFICANT_SAMPLE = 100;
/** Fixed relative threshold of rule 17's "warn when getting close"; not configurable on purpose. */
const NEAR_LIMIT_PCT = Decimal.parse("80");

export interface DrawdownPoint {
  date: CivilDate;
  cumulative_eur: Money;
}

export interface ExcludedThesis {
  thesis_id: string;
  /** Its sales consumed lots it did not buy: the global FIFO mixed two theses. */
  reason: "foreign_lots";
}

export interface BucketStats {
  date: CivilDate;
  closed_theses: number;
  /** Closed theses whose result can be measured; the others are in `excluded`. */
  measured_theses: number;
  sell_operations: number;
  excluded: ExcludedThesis[];
  hit_rate?: Decimal;
  average_win_eur?: Money;
  average_loss_eur?: Money;
  expectancy_eur?: Money;
  /** Rule 14: the most revealing number of the panel. */
  fees_eur: Money;
  traded_capital_eur: Money;
  fees_pct?: Decimal;
  max_drawdown_eur: Money;
  drawdown_peak?: DrawdownPoint;
  drawdown_valley?: DrawdownPoint;
  vs_index_total_eur?: Money;
  vs_index_missing: number;
  warnings: Warning[];
}

/**
 * Why a control rule could not be measured. Not computing a percentage over a
 * partial total is right (constitution V); staying quiet about it is not, so
 * the reason travels next to the field that is missing and, when the rule is
 * configured, it also becomes a warning of its own.
 */
export interface ControlGap {
  reason: "missing_prices" | "no_contribution" | "partial_net_worth" | "no_net_worth";
  /** The assets with no price behind the gap. */
  assets?: AssetId[];
  /** The currencies with no rate behind the gap. */
  currencies?: Currency[];
}

export interface BucketControls {
  /** Σ `cash_deposit` of the bucket accounts, **without** subtracting withdrawals. */
  contribution_gross_eur: Money;
  contribution_net_eur: Money;
  /** `pct × monthly × months`; absent when either parameter is missing. */
  budget_eur?: Money;
  months_elapsed?: number;
  realized_eur: Money;
  /** Absent when a position of the bucket has no price. */
  unrealized_eur?: Money;
  /** Accumulated loss over the gross contribution; absent without a contribution. */
  loss_pct?: Decimal;
  /** Why the stop-loss rule could not be measured; absent when it could. */
  loss_pct_unavailable?: ControlGap;
  /** Bucket over total net worth; absent when the net worth is partial. */
  weight_pct?: Decimal;
  /** Why the weight rule could not be measured; absent when it could. */
  weight_pct_unavailable?: ControlGap;
  warnings: Warning[];
}

/**
 * A thesis is contaminated when a sale of its own consumed lots that do not
 * come, through their lineage, from one of its own purchases. It happens with a
 * thesis closed while still holding (the next thesis on the asset eats its
 * leftovers) and with a thesis that never bought anything and sells what a
 * corporate action handed it.
 */
const isContaminated = (thesis: BucketThesisView, lots: Map<string, FiscalLot>): boolean => {
  const own = new Set(thesis.buys.map((leg) => leg.event_id));
  const sells = new Set(thesis.sells.map((leg) => leg.event_id));
  for (const lot of lots.values()) {
    const consumedHere = lot.consumptions.some((entry) => sells.has(entry.event_id));
    if (consumedHere && !own.has(rootEventOf(lots, lot))) {
      return true;
    }
  }
  return false;
};

const average = (values: readonly Money[]): Money | undefined =>
  values.length === 0
    ? undefined
    : values
        .reduce((sum, value) => sum.add(value), Money.zero(EUR))
        .div(Decimal.parse(String(values.length)));

/**
 * The worst run of the realized result: sales ordered by fiscal date (ties by
 * file position), cumulative gain, and the largest fall from a previous peak.
 * Computed **from the ledger alone**, with no price, so it is exact (decision
 * (e)); the value curve needs prices and belongs to the web.
 */
const drawdownOf = (
  gains: readonly RealizedGain[],
): Pick<BucketStats, "max_drawdown_eur" | "drawdown_peak" | "drawdown_valley"> => {
  // `state.gains` is already in (fiscal date, file position) order: pass B
  // applies the operations in exactly that order (data-schema.md §7.1), and
  // filtering preserves it. Sorting again would only be a second definition of
  // chronology to keep in step with the first.
  const ordered = gains;
  let cumulative = Money.zero(EUR);
  let peak = Money.zero(EUR);
  let peakPoint: DrawdownPoint | undefined;
  let worst = Money.zero(EUR);
  let worstPeak: DrawdownPoint | undefined;
  let worstValley: DrawdownPoint | undefined;
  for (const gain of ordered) {
    cumulative = cumulative.add(gain.gain_eur);
    if (cumulative.amount.gt(peak.amount)) {
      peak = cumulative;
      peakPoint = { date: gain.fiscal_date, cumulative_eur: cumulative };
    }
    const fall = peak.sub(cumulative);
    if (fall.amount.gt(worst.amount)) {
      worst = fall;
      worstPeak = peakPoint;
      worstValley = { date: gain.fiscal_date, cumulative_eur: cumulative };
    }
  }
  return {
    max_drawdown_eur: worst,
    ...(worstPeak === undefined ? {} : { drawdown_peak: worstPeak }),
    ...(worstValley === undefined ? {} : { drawdown_valley: worstValley }),
  };
};

interface CashFlows {
  deposits: Money;
  withdrawals: Money;
  firstDate?: CivilDate;
}

/**
 * Money put into the bucket and taken out of it, in euros at the rate of each
 * event, and the date of its first event. Walks the raw events, like
 * `costSummary`: accumulating this in the projection would change `snapshotOf`
 * and the golden file for no reason.
 */
const cashFlowsOf = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  accounts: ReadonlySet<string>,
  asOf: CivilDate | undefined,
): CashFlows => {
  const invalid = new Set(state.invalid.map((entry) => entry.event.id));
  const flows: CashFlows = { deposits: Money.zero(EUR), withdrawals: Money.zero(EUR) };
  for (const event of events) {
    if (state.reversed.has(event.id) || invalid.has(event.id) || !isOperationEvent(event)) {
      continue;
    }
    const date = businessDateOf(state, event);
    if (asOf !== undefined && date > asOf) {
      continue;
    }
    const account = (event as { account_id?: AccountId }).account_id;
    if (account === undefined || !accounts.has(account)) {
      continue;
    }
    if (flows.firstDate === undefined || date < flows.firstDate) {
      flows.firstDate = date;
    }
    if (event.type === "cash_deposit" || event.type === "cash_withdrawal") {
      const amount = FxRate.of(
        Decimal.parse(event.fx_rate),
        event.currency,
        event.fx_rate_date ?? date,
      ).toEur(Money.parse(event.amount, event.currency));
      if (event.type === "cash_deposit") {
        flows.deposits = flows.deposits.add(amount);
      } else {
        flows.withdrawals = flows.withdrawals.add(amount);
      }
    }
  }
  return flows;
};

/** Whole months between two dates, counting the month of the first one. */
const monthsBetween = (from: CivilDate, to: CivilDate): number => {
  const months =
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    (Number(to.slice(5, 7)) - Number(from.slice(5, 7))) +
    (Number(to.slice(8, 10)) >= Number(from.slice(8, 10)) ? 1 : 0);
  return Math.max(months, 0);
};

export interface BucketReport {
  stats: BucketStats;
  controls: BucketControls;
}

/** Trading statistics and control rules of the bucket at a date (§3.4 and §3.5). */
export const bucketStats = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  date: CivilDate,
  settings: Settings,
  asOf?: CivilDate,
  external?: ExternalPrices,
): BucketReport => {
  const accounts = bucketAccountIds(state);
  const theses = bucketTheses(state, date, settings, external);
  const gains = state.gains.filter((gain) => accounts.has(gain.account_id));
  const lots = lotIndexOf(state);
  const warnings: Warning[] = [];

  const closed = theses.filter((thesis) => thesis.status === "closed");
  const excluded: ExcludedThesis[] = [];
  const measured: BucketThesisView[] = [];
  for (const thesis of closed) {
    if (isContaminated(thesis, lots)) {
      excluded.push({ thesis_id: thesis.thesis_id, reason: "foreign_lots" });
    } else {
      measured.push(thesis);
    }
  }

  const results = measured.map((thesis) => thesis.result_eur);
  const wins = results.filter((result) => result.amount.isPositive());
  const losses = results.filter((result) => result.amount.isNegative());
  const costs = costSummary(state, events, date, settings, asOf, external);

  if (closed.length < SIGNIFICANT_SAMPLE) {
    warn(
      warnings,
      "bucket_sample_too_small",
      `${closed.length} closed theses and ${gains.length} sales: below ${SIGNIFICANT_SAMPLE} operations the sample does not tell skill from luck`,
      { closed_theses: closed.length, sell_operations: gains.length, sample: SIGNIFICANT_SAMPLE },
    );
  }
  if (excluded.length > 0) {
    warn(
      warnings,
      "bucket_contaminated_theses",
      `${excluded.length} closed theses are out of the averages: their sales consumed lots bought by another thesis (global FIFO, ADR-0009)`,
      { theses: excluded.map((entry) => entry.thesis_id) },
    );
  }

  const withIndex = theses.filter((thesis) => thesis.result_vs_index_eur !== undefined);
  const stats: BucketStats = {
    date,
    closed_theses: closed.length,
    measured_theses: measured.length,
    sell_operations: gains.length,
    excluded,
    ...(measured.length === 0
      ? {}
      : {
          hit_rate: Decimal.parse(String(wins.length)).div(Decimal.parse(String(measured.length))),
        }),
    ...(average(wins) === undefined ? {} : { average_win_eur: average(wins) as Money }),
    ...(average(losses) === undefined ? {} : { average_loss_eur: average(losses) as Money }),
    ...(average(results) === undefined ? {} : { expectancy_eur: average(results) as Money }),
    fees_eur: costs.bucket.totals.fees_eur,
    traded_capital_eur: costs.bucket.totals.invested_eur,
    ...(costs.bucket.totals.fees_pct === undefined
      ? {}
      : { fees_pct: costs.bucket.totals.fees_pct }),
    ...drawdownOf(gains),
    ...(withIndex.length === 0
      ? {}
      : {
          vs_index_total_eur: withIndex.reduce(
            (sum, thesis) => sum.add(thesis.result_vs_index_eur as Money),
            Money.zero(EUR),
          ),
        }),
    vs_index_missing: theses.length - withIndex.length,
    warnings,
  };

  return { stats, controls: controlsOf(state, events, date, settings, accounts, asOf, external) };
};

/** Rules 17 and 18: warnings, never rejections, and never over a partial total. */
const controlsOf = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  date: CivilDate,
  settings: Settings,
  accounts: ReadonlySet<string>,
  asOf: CivilDate | undefined,
  external: ExternalPrices | undefined,
): BucketControls => {
  const warnings: Warning[] = [];
  const flows = cashFlowsOf(state, events, accounts, asOf);
  const gross = flows.deposits;
  const net = flows.deposits.sub(flows.withdrawals);
  const realized = state.gains
    .filter((gain) => accounts.has(gain.account_id))
    .reduce((sum, gain) => sum.add(gain.gain_eur), Money.zero(EUR));
  const positions = bucketPositions(state, date, settings, external);
  // One row without a latent gain — no price, or a position no lot backs — and
  // there is no total: adding it up as zero would be the partial total that
  // looks complete (constitution V).
  const unrealized = positions.rows.every((row) => row.unrealized_eur !== undefined)
    ? positions.rows.reduce((sum, row) => sum.add(row.unrealized_eur as Money), Money.zero(EUR))
    : undefined;

  const limit = settings.bucket_max_cumulative_contribution;
  if (limit !== undefined) {
    const cap = Money.parse(limit, EUR);
    if (gross.amount.gt(cap.amount)) {
      warn(
        warnings,
        "bucket_contribution_exceeded",
        `the gross contribution to the bucket is ${gross.roundToCents().amount.toString()} EUR, above the cap of ${cap.amount.toString()} EUR (rule 17)`,
        { gross_eur: gross.roundToCents().amount.toString(), limit_eur: cap.amount.toString() },
      );
    } else if (
      cap.amount.isPositive() &&
      gross.amount.div(cap.amount).mul(HUNDRED).gt(NEAR_LIMIT_PCT)
    ) {
      warn(
        warnings,
        "bucket_contribution_near_limit",
        `the gross contribution to the bucket is above ${NEAR_LIMIT_PCT.toString()} % of the cap of ${cap.amount.toString()} EUR (rule 17)`,
        { gross_eur: gross.roundToCents().amount.toString(), limit_eur: cap.amount.toString() },
      );
    }
  }

  // A percentage over an incomplete total is exactly the "partial total that
  // looks complete" the constitution forbids. What it does not excuse is
  // silence: the rule that cannot be measured says so, with its cause.
  const stopLossGap: ControlGap | undefined =
    unrealized === undefined
      ? {
          reason: "missing_prices",
          assets: positions.rows
            .filter((row) => row.unrealized_eur === undefined)
            .map((row) => row.asset_id),
        }
      : gross.amount.isPositive()
        ? undefined
        : { reason: "no_contribution" };
  const total = realized.add(unrealized ?? Money.zero(EUR));
  const lossPct =
    stopLossGap !== undefined || !total.amount.isNegative()
      ? undefined
      : total.neg().amount.div(gross.amount).mul(HUNDRED);
  const stopLoss = settings.bucket_stop_loss_pct;
  if (stopLoss !== undefined && stopLossGap !== undefined) {
    warn(
      warnings,
      "bucket_stop_loss_not_evaluated",
      `the stop-loss rule of ${stopLoss} % cannot be measured (${stopLossGap.reason}): the accumulated loss is not a percentage of anything yet (rule 17)`,
      { limit_pct: stopLoss, ...stopLossGap },
    );
  }
  if (lossPct !== undefined && stopLoss !== undefined && lossPct.gt(Decimal.parse(stopLoss))) {
    warn(
      warnings,
      "bucket_stop_loss_reached",
      `the accumulated loss of the bucket is ${lossPct.round(2).toString()} % of the gross contribution, above the ${stopLoss} % configured (rule 17)`,
      {
        loss_pct: lossPct.round(2).toString(),
        limit_pct: stopLoss,
        loss_eur: total.neg().roundToCents().amount.toString(),
        gross_eur: gross.roundToCents().amount.toString(),
      },
    );
  }

  const worth = netWorth(state, date, settings, external);
  const weightGap: ControlGap | undefined = worth.partial
    ? {
        reason: "partial_net_worth",
        assets: [...worth.core.missing_prices, ...worth.bucket.missing_prices],
        currencies: worth.cash.missing_rates,
      }
    : worth.total_eur.amount.isPositive()
      ? undefined
      : { reason: "no_net_worth" };
  const weightPct =
    weightGap === undefined
      ? worth.bucket.total_eur.amount.div(worth.total_eur.amount).mul(HUNDRED)
      : undefined;
  const maxWeight = settings.bucket_max_weight_pct;
  if (maxWeight !== undefined && weightGap !== undefined) {
    warn(
      warnings,
      "bucket_weight_not_evaluated",
      `the weight rule of ${maxWeight} % cannot be measured (${weightGap.reason}): the bucket is not a percentage of an incomplete net worth (rule 18)`,
      { limit_pct: maxWeight, ...weightGap },
    );
  }
  if (
    weightPct !== undefined &&
    maxWeight !== undefined &&
    weightPct.gt(Decimal.parse(maxWeight))
  ) {
    warn(
      warnings,
      "bucket_weight_exceeded",
      `the bucket weighs ${weightPct.round(2).toString()} % of the total net worth, above the ${maxWeight} % configured (rule 18)`,
      { weight_pct: weightPct.round(2).toString(), limit_pct: maxWeight },
    );
  }

  const pct = settings.bucket_pct_of_contribution;
  const monthly = settings.monthly_contribution_eur;
  const months = flows.firstDate === undefined ? undefined : monthsBetween(flows.firstDate, date);
  const budget =
    pct === undefined || monthly === undefined || months === undefined
      ? undefined
      : Money.parse(monthly, EUR)
          .mul(Decimal.parse(pct))
          .div(HUNDRED)
          .mul(Decimal.parse(String(months)));

  return {
    contribution_gross_eur: gross,
    contribution_net_eur: net,
    ...(budget === undefined ? {} : { budget_eur: budget }),
    ...(months === undefined ? {} : { months_elapsed: months }),
    realized_eur: realized,
    ...(unrealized === undefined ? {} : { unrealized_eur: unrealized }),
    ...(lossPct === undefined ? {} : { loss_pct: lossPct }),
    ...(stopLossGap === undefined ? {} : { loss_pct_unavailable: stopLossGap }),
    ...(weightPct === undefined ? {} : { weight_pct: weightPct }),
    ...(weightGap === undefined ? {} : { weight_pct_unavailable: weightGap }),
    warnings,
  };
};
