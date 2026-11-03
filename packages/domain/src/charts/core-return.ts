// How the core book did over a period, net of the money put in or taken out: the «este mes» and
// «12 meses» of the summary. **Only the core** (its assets and the cash of its own accounts):
// a return over the total would mix the core and the bucket in one metric (constitution III), and
// the bucket has its own comparison, against the index.
//
// Modified Dietz, with each flow weighted by the days it was inside:
//
//   r = (V1 − V0 − F) / (V0 + Σ wᵢ·Fᵢ),   wᵢ = (to − dᵢ) / (to − from) in days
//
// - V0 and V1 are the core with the cash of its accounts at `from` and at `to` (`bookCashSeries`,
//   the same values as the line drawn), each with the settings in force on its day.
// - The flows are exactly those of `contributedSeries` (`coreCashFlows`): deposits add and
//   withdrawals subtract, in core accounts, at the rate of their own event, with a business date in
//   `(from, to]`. Dividends, interest and fees are not flows: they are the return. Money moved from
//   the core to the bucket is a withdrawal of the core.
//
// It depends on prices, so it is informative: nothing fiscal reads it. **It is never estimated**:
// with a missing price at either end, with less history than the period, with a purchase whose cash
// was never recorded, or with no positive base, there is no figure and the reason says why.

import { addDays, addYears, type CivilDate, daysBetween } from "../dates/civil-date.js";
import { Decimal, HUNDRED } from "../money/decimal.js";
import { Money } from "../money/money.js";
import { businessDateOf, liveOperations, projectLedger } from "../projections/project-ledger.js";
import type { LedgerEvent } from "../schema/events.js";
import { bookCashSeries } from "./book-cash.js";
import { buysUncovered, coreCashFlows } from "./contributed.js";

export type CoreReturnGap =
  /** A price or a rate of the core is missing at one end. */
  | "partial"
  /** The core's first operation comes after the start of the period. */
  | "short_history"
  /** The core bought before any deposit paid for it: a flow is unknown. */
  | "uncovered_buys"
  /** Nothing invested over the period (V0 + Σ wᵢ·Fᵢ ≤ 0). */
  | "no_base";

export interface CoreReturn {
  from: CivilDate;
  to: CivilDate;
  /** Percent, exact; absent with `gap`. */
  pct?: Decimal;
  gap?: CoreReturnGap;
}

/** «Este mes»: from the last day of the month before `date` to `date`. */
export const monthPeriod = (date: CivilDate): { from: CivilDate; to: CivilDate } => ({
  from: addDays(`${date.slice(0, 7)}-01`, -1),
  to: date,
});

/** «12 meses»: from the same day a year before (29-02 → 28-02) to `date`. */
export const yearPeriod = (date: CivilDate): { from: CivilDate; to: CivilDate } => ({
  from: addYears(date, -1),
  to: date,
});

export const coreReturn = (
  events: readonly LedgerEvent[],
  period: { from: CivilDate; to: CivilDate },
): CoreReturn => {
  const { from, to } = period;
  const state = projectLedger(events, { collectErrors: true });
  const flows = coreCashFlows(state, events);
  const without = (gap: CoreReturnGap): CoreReturn => ({ from, to, gap });

  let first: CivilDate | undefined;
  for (const event of liveOperations(state, events)) {
    const account = (event as { account_id?: string }).account_id;
    if (account !== undefined && state.accounts.get(account)?.book === "core") {
      const date = businessDateOf(state, event);
      first = first === undefined || date < first ? date : first;
    }
  }
  if (first === undefined || first > from) {
    return without("short_history");
  }
  if (flows.firstBuy !== undefined && flows.firstBuy <= to && buysUncovered(flows)) {
    return without("uncovered_buys");
  }
  const [start, end] = bookCashSeries(events, { to, dates: [from, to] }).points;
  const v0 = start?.core_eur;
  const v1 = end?.core_eur;
  if (v0 === undefined || v1 === undefined) {
    return without("partial");
  }

  const span = daysBetween(from, to);
  let net = Money.zero("EUR");
  let weighted = Money.zero("EUR");
  for (const flow of flows.flows) {
    if (flow.date > from && flow.date <= to) {
      net = net.add(flow.eur);
      weighted = weighted.add(
        flow.eur.mul(
          Decimal.parse(String(daysBetween(flow.date, to))).div(Decimal.parse(String(span))),
        ),
      );
    }
  }
  const base = v0.add(weighted);
  if (!base.amount.isPositive()) {
    return without("no_base");
  }
  return { from, to, pct: v1.sub(v0).sub(net).amount.div(base.amount).mul(HUNDRED) };
};
