// The rate proposed when recording, and when a typed one needs a confirmation
// (ADR-0029, points 3 and 7; decisions (e), (p) and (w) of prompt 012).
//
// The application proposes the `fx_rate` and `fx_rate_date` of the history for
// the reference date of each rate — for a buy or a sale **the fiscal date by
// `fiscal_date_rule`, never `trade_date`**: a proposed date that is not the
// last publication on or before the fiscal date would be the application
// provoking its own `fx_rate_date_not_latest`. Without a history nothing is
// proposed and the rate is typed as always: manual entry never disappears.
//
// A typed rate that differs from the official one **when the history is
// conclusive** asks for an explicit confirmation showing the official one. It
// is not a refusal — recording cannot depend on a downloaded file being
// right — and it is not a validation of the loader. The difference is
// **numeric**: `0.85950` typed from the daily XML is the same rate as
// `0.8595`. The domain decides when to confirm; the interfaces only ask.

import type { CivilDate } from "../dates/civil-date.js";
import type { LedgerState } from "../projections/state.js";
import type { EcbHistory } from "./history.js";
import { sameRate } from "./history.js";
import { type RatePoint, ratePointsOf } from "./ledger-rates.js";
import { type RateResolution, resolveRate } from "./resolve.js";

type Fields = Readonly<Record<string, unknown>>;

export interface OfficialRate {
  readonly point: RatePoint;
  /** `no_history`: there is no history to ask, so nothing is proposed or checked (decision (p)). */
  readonly resolution: RateResolution | { kind: "no_history" };
}

/**
 * What the history says of every rate of an event or a draft. The euro needs
 * no history: its rate is 1, dated on the last working day on or before the
 * reference.
 */
export const officialRatesOf = (
  history: EcbHistory | undefined,
  state: LedgerState,
  event: Fields,
  staleDays: number,
): OfficialRate[] =>
  ratePointsOf(state, event).map((point) => ({
    point,
    resolution:
      history === undefined && point.currency !== "EUR"
        ? { kind: "no_history" }
        : resolveRate(history as EcbHistory, point.currency, point.reference, staleDays),
  }));

/** Where to write a value: a top-level field, or one of an effect. */
const setPath = (target: Record<string, unknown>, path: string, value: string): void => {
  const match = /^effects\[(\d+)\]\.(.+)$/.exec(path);
  if (match === null) {
    target[path] = value;
    return;
  }
  const effects = target.effects as Record<string, unknown>[];
  const index = Number(match[1]);
  effects[index] = { ...effects[index], [match[2] as string]: value };
};

/**
 * The draft with the rate and its date filled in **where they are missing**
 * and the history resolves them (the euro: "1", dated on the last working day
 * on or before the reference). What the user typed is never overwritten.
 */
export const proposeRates = (
  history: EcbHistory | undefined,
  state: LedgerState,
  draft: Fields,
  staleDays: number,
): { draft: Record<string, unknown>; proposed: OfficialRate[] } => {
  const next: Record<string, unknown> = {
    ...draft,
    ...(Array.isArray(draft.effects) ? { effects: [...(draft.effects as unknown[])] } : {}),
  };
  const proposed: OfficialRate[] = [];
  for (const official of officialRatesOf(history, state, draft, staleDays)) {
    const { point, resolution } = official;
    if (point.rate !== undefined || point.rate_date !== undefined) {
      continue;
    }
    if (resolution.kind !== "resolved" && resolution.kind !== "euro") {
      continue;
    }
    setPath(next, point.path, resolution.rate);
    setPath(next, point.datePath, resolution.date);
    proposed.push(official);
  }
  return { draft: next, proposed };
};

export interface RateMismatch {
  readonly point: RatePoint;
  readonly official: { rate: string; date: CivilDate };
}

/**
 * The rates of a draft that differ — by value or by date — from the official
 * one of their reference date, **only where the history is conclusive**. Each
 * needs an explicit confirmation; an empty list needs none.
 */
export const rateConfirmations = (
  history: EcbHistory | undefined,
  state: LedgerState,
  draft: Fields,
  staleDays: number,
): RateMismatch[] =>
  officialRatesOf(history, state, draft, staleDays).flatMap(({ point, resolution }) => {
    if (resolution.kind !== "resolved" || point.rate === undefined) {
      return [];
    }
    const sameValue = sameRate(point.rate, resolution.rate);
    const sameDate = point.rate_date === undefined || point.rate_date === resolution.date;
    return sameValue && sameDate
      ? []
      : [{ point, official: { rate: resolution.rate, date: resolution.date } }];
  });

/** The rates the ECB has not published yet for their reference date: the case of a draft (block 5). */
export const unpublishedRates = (
  history: EcbHistory | undefined,
  state: LedgerState,
  draft: Fields,
  staleDays: number,
): OfficialRate[] =>
  officialRatesOf(history, state, draft, staleDays).filter(
    ({ resolution }) => resolution.kind === "not_yet_published",
  );
