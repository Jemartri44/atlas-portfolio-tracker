// What the summary computes after its first paint, like the tax status: the return of the core,
// the month's plan and the bucket against the index. Each projects the ledger again, and the
// bucket's statistics read every thesis; none of it must hold the total back.

import type { CivilDate, ExternalPrices, LedgerEvent, LedgerState, Settings } from "@atlas/domain";
import { type CoreReturn, coreReturn, monthPeriod, yearPeriod } from "@atlas/domain/charts";
import { bucketStats, type MonthPlan, monthPlan } from "@atlas/domain/portfolio";

export interface SummaryExtras {
  month: CoreReturn;
  year: CoreReturn;
  plan: MonthPlan;
  /** The bucket against the same money in the index, in percent; absent until it can be said. */
  bucketVsIndexPct?: string;
}

export const summaryExtras = (input: {
  events: readonly LedgerEvent[];
  state: LedgerState;
  date: CivilDate;
  settings: Settings;
  external?: ExternalPrices | undefined;
}): SummaryExtras => {
  const { events, state, date, settings, external } = input;
  const vsIndex = bucketStats(state, events, date, settings, date, external).stats.vs_index_pct;
  return {
    month: coreReturn(events, monthPeriod(date)),
    year: coreReturn(events, yearPeriod(date)),
    plan: monthPlan(events, date, external),
    ...(vsIndex === undefined ? {} : { bucketVsIndexPct: vsIndex.toString() }),
  };
};
