// The rates of the ledger against the official history (ADR-0029, point 8;
// decisions (f), (p), (q) and (z) of prompt 012).
//
// Every rate field the schema defines as an ECB reference rate — through the
// one enumeration, `FX_FIELDS`, effects included — of every event in force is
// compared with the history, **numerically**. A euro line (`"1"`) is not an
// ECB rate: there is no column for the euro, and comparing it would make each
// one a finding. What the broker really converted (`broker_settled_eur`) is
// not a reference rate and is not compared.
//
// Each finding is emitted **with its own literal, in its own call**: four of
// them look alike, and folding one into another is how feature 011 wrote a
// false reason forever into an append-only file.
//
// **Without a history nothing is said to be right or wrong**: the outcome is
// `unchecked`, with how many rates stayed without being contrasted. That is a
// datum of the domain, never a condition an interface deduces, and "no
// findings" can never be said of rates nobody looked at.

import type { CivilDate } from "../dates/civil-date.js";
import type { IntegrityFinding } from "../projections/integrity.js";
import type { LedgerState } from "../projections/state.js";
import type { LedgerEvent } from "../schema/events.js";
import { type EcbHistory, latestPublication, rateOn, sameRate } from "./history.js";
import { firstRateDateOf, type RatePoint, ratePointsOf } from "./ledger-rates.js";
import { resolveRate } from "./resolve.js";
import { calendarYears, crossCheckCalendar } from "./target.js";

export type RateCheck =
  | {
      kind: "checked";
      findings: IntegrityFinding[];
      /** Foreign-currency rates compared with the history. */
      compared: number;
      latest: CivilDate;
    }
  | {
      kind: "unchecked";
      /** Foreign-currency rates of the ledger nobody could contrast: no history. */
      rates: number;
    };

const warning = (
  code: string,
  message: string,
  ids: string[],
  details: Record<string, string>,
): IntegrityFinding => ({
  severity: "warning",
  code,
  message,
  event_ids: ids,
  details,
});

/** The rates of the events in force, not in euros: what a history can contrast. */
export const foreignRatesOf = (
  state: LedgerState,
  events: readonly LedgerEvent[],
): { event_id: string; point: RatePoint }[] =>
  events
    .filter((event) => !state.reversed.has(event.id) && event.type !== "reversal")
    .flatMap((event) =>
      ratePointsOf(state, event as unknown as Record<string, unknown>)
        .filter((point) => point.currency !== "EUR")
        .map((point) => ({ event_id: event.id, point })),
    );

const findingsOf = (
  history: EcbHistory,
  id: string,
  point: RatePoint,
  staleDays: number,
): IntegrityFinding[] => {
  const where = `${point.path} of ${id}`;
  // A recorded line always carries its rate and its date: the loader requires
  // both of every pair of `FX_FIELDS` (it is only a draft that may lack them).
  const facts: Record<string, string> = {
    field: point.path,
    currency: point.currency,
    reference: point.reference,
    basis: point.basis,
    rate: point.rate as string,
    rate_date: point.rate_date as string,
  };
  const resolution = resolveRate(history, point.currency, point.reference, staleDays);
  if (resolution.kind === "currency_not_published") {
    return [
      warning(
        "fx_rate_currency_unlisted",
        `${where}: the ECB does not publish ${point.currency} on ${point.reference}`,
        [id],
        facts,
      ),
    ];
  }
  if (resolution.kind === "currency_stale") {
    return [
      warning(
        "fx_rate_currency_stale",
        `${where}: the ECB stopped publishing ${point.currency} on ${resolution.last}`,
        [id],
        { ...facts, last: resolution.last },
      ),
    ];
  }
  if (resolution.kind === "not_yet_published") {
    return [
      warning(
        "fx_rate_not_yet_in_history",
        `${where}: the history reaches ${resolution.latest}, before ${point.reference}; not contrasted`,
        [id],
        { ...facts, latest: resolution.latest },
      ),
    ];
  }
  // `resolved`: the euro never reaches here, it was filtered out before.
  const found: IntegrityFinding[] = [];
  const rateDate = point.rate_date as CivilDate;
  const official = rateOn(history, point.currency, rateDate);
  if (official === undefined) {
    found.push(
      warning(
        "fx_rate_date_unpublished",
        `${where}: the ECB published no ${point.currency} rate on ${rateDate}`,
        [id],
        facts,
      ),
    );
  } else if (!sameRate(point.rate as string, official)) {
    found.push(
      warning(
        "fx_rate_mismatch",
        `${where}: ${point.rate} is not the official ${official} of ${rateDate}`,
        [id],
        { ...facts, official },
      ),
    );
  }
  if (rateDate !== resolution.date) {
    found.push(
      warning(
        "fx_rate_date_not_latest",
        `${where}: the rate of ${point.reference} is the one of ${resolution.date}, not of ${rateDate}`,
        [id],
        { ...facts, official: resolution.rate, official_date: resolution.date },
      ),
    );
  }
  return found;
};

/**
 * Contrasts the ledger's rates with the history, and cross-checks the TARGET
 * calendar in the years the ledger uses (a warning, never a block).
 */
export const checkLedgerRates = (
  history: EcbHistory | undefined,
  state: LedgerState,
  events: readonly LedgerEvent[],
  staleDays: number,
  today: CivilDate,
): RateCheck => {
  const rates = foreignRatesOf(state, events);
  if (history === undefined) {
    return { kind: "unchecked", rates: rates.length };
  }
  const findings = rates.flatMap(({ event_id, point }) =>
    findingsOf(history, event_id, point, staleDays),
  );
  const first = firstRateDateOf(events);
  for (const disagreement of crossCheckCalendar(history, calendarYears(first, today))) {
    findings.push(
      warning(
        "target_calendar_mismatch",
        disagreement.kind === "working_day_without_publication"
          ? `${disagreement.date} is a working day of TARGET and the history has no publication`
          : `${disagreement.date} is a closing day of TARGET and the history has a publication`,
        [],
        { date: disagreement.date, kind: disagreement.kind },
      ),
    );
  }
  return { kind: "checked", findings, compared: rates.length, latest: latestPublication(history) };
};
