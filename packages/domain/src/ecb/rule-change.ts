// What a change of `fiscal_date_rule` does to the ECB rates of the ledger
// (ADR-0029, point 10; block 6 of prompt 012; criterion 25 of
// `docs/fiscal-questions.md`).
//
// The rate of a line is the one of its fiscal date **by the rule in force when
// it was recorded**. Change the rule and the fiscal date moves; the rate stays,
// and it may no longer be the one of the new date. **The engine never
// recalculates with another rate in silence**: the rate of the ledger is the
// only one any figure uses. Instead:
//
// 1. **Before** the `settings_changed` is confirmed, the lines it would leave
//    that way are said (`ruleChangeRates`). Without a history, part of it is
//    known all the same — a rate dated **after** the new fiscal date — and the
//    rest is said as "cannot be verified against the official one", never taken
//    for right or wrong (decision (p)).
// 2. After, the check of the ledger flags them (block 4), and the tax report
//    carries a note while they remain.
// 3. The fix is the correction of always, a reversal and a new line with the
//    official rate (ADR-0003), which the application **proposes**
//    (`prepareRateCorrections`) and the user confirms. Several lines make a
//    **chain**, and the chain is written **in one write or not at all**
//    (`writeRateCorrections`, decision (u)): a chain half written could leave
//    a line reversed without its new version.

import { type CivilDate, compareCivilDates } from "../dates/civil-date.js";
import { createUlidGenerator } from "../ids/ulid.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { LedgerState } from "../projections/state.js";
import type { Draft, LedgerEvent, ReversalEvent, SupportedEvent } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import type { UseCaseDeps } from "../usecases/deps.js";
import { completeDraft } from "../usecases/record-event.js";
import { checkCandidate } from "../usecases/rectify.js";
import { type EcbHistory, sameRate } from "./history.js";
import { type RatePoint, ratePointsOf } from "./ledger-rates.js";
import { setPath } from "./propose.js";
import { resolveRate } from "./resolve.js";

/**
 * - `after_fiscal_date`: the rate is dated after the new fiscal date — known
 *   **without** a history, and the projection warns of it;
 * - `not_official`: the history says the rate of the new fiscal date is
 *   another one (by value or by date);
 * - `unverifiable`: nobody can say — no history, or the history does not
 *   reach, or does not list the currency.
 */
export type RuleChangeVerdict = "after_fiscal_date" | "not_official" | "unverifiable";

export interface RuleChangeLine {
  event_id: string;
  path: string;
  currency: string;
  rate: string;
  rate_date: CivilDate;
  fiscal_date: CivilDate;
  new_fiscal_date: CivilDate;
  verdict: RuleChangeVerdict;
  /** The official rate of the new fiscal date, when the history (or the euro) gives it. */
  official?: { rate: string; date: CivilDate };
}

export interface RuleChangeImpact {
  lines: RuleChangeLine[];
  /** Whether there was a history to ask: without one, `unverifiable` is all it can say. */
  checked: boolean;
}

type Official = { rate: string; date: CivilDate } | undefined;

/** The official rate of `point` for its reference date, if anyone can say it. */
const officialOf = (
  history: EcbHistory | undefined,
  point: RatePoint,
  staleDays: number,
): Official => {
  if (point.currency !== "EUR" && history === undefined) {
    return undefined;
  }
  const resolution = resolveRate(history as EcbHistory, point.currency, point.reference, staleDays);
  return resolution.kind === "euro" || resolution.kind === "resolved"
    ? { rate: resolution.rate, date: resolution.date }
    : undefined;
};

/** The fiscal-date rates of the events in force, by event and field. */
const fiscalPoints = (
  state: LedgerState,
  events: readonly LedgerEvent[],
): Map<string, { event_id: string; point: RatePoint }> => {
  const found = new Map<string, { event_id: string; point: RatePoint }>();
  for (const event of events) {
    if (state.reversed.has(event.id) || event.type === "reversal") {
      continue;
    }
    for (const point of ratePointsOf(state, event as unknown as Record<string, unknown>)) {
      if (point.basis === "fiscal") {
        found.set(`${event.id}|${point.path}`, { event_id: event.id, point });
      }
    }
  }
  return found;
};

/**
 * The lines whose rate a change from `current` to `next` would leave as not
 * the one of its fiscal date — said before the change is confirmed.
 */
export const ruleChangeRates = (
  history: EcbHistory | undefined,
  events: readonly LedgerEvent[],
  current: Settings,
  next: Settings,
  staleDays: number,
): RuleChangeImpact => {
  const before = fiscalPoints(
    projectLedger(events, { settings: current, collectErrors: true }),
    events,
  );
  const after = fiscalPoints(
    projectLedger(events, { settings: next, collectErrors: true }),
    events,
  );
  const lines: RuleChangeLine[] = [];
  for (const [key, { event_id, point }] of after) {
    const was = before.get(key)?.point.reference;
    if (was === undefined || was === point.reference) {
      continue;
    }
    // A recorded line always carries both halves of the pair (the loader).
    const rate = point.rate as string;
    const rateDate = point.rate_date as CivilDate;
    const official = officialOf(history, point, staleDays);
    const late = compareCivilDates(rateDate, point.reference) > 0;
    const same =
      official !== undefined && official.date === rateDate && sameRate(official.rate, rate);
    let verdict: RuleChangeVerdict;
    if (late) {
      verdict = "after_fiscal_date";
    } else if (same || point.currency === "EUR") {
      // The rate of the old date is also the one of the new: nothing to say.
      // The euro is 1 on every day; only a date after the fiscal one is wrong.
      continue;
    } else {
      verdict = official === undefined ? "unverifiable" : "not_official";
    }
    lines.push({
      event_id,
      path: point.path,
      currency: point.currency,
      rate,
      rate_date: rateDate,
      fiscal_date: was,
      new_fiscal_date: point.reference,
      verdict,
      ...(official === undefined ? {} : { official }),
    });
  }
  return { lines, checked: history !== undefined };
};

/** A line to correct: its rate and date as recorded, and the official ones of its fiscal date. */
export interface RateCorrection {
  event_id: string;
  path: string;
  datePath: string;
  currency: string;
  rate: string;
  rate_date: CivilDate;
  fiscal_date: CivilDate;
  official: { rate: string; date: CivilDate };
}

/**
 * The lines of the ledger, under the rule **in force**, whose rate belongs to
 * another day than the publication that applies to their fiscal date — the
 * signature a change of rule leaves — and whose official rate is known. A
 * typed rate of the right day that differs in value is not here: it was
 * confirmed as typed (block 3), and the check keeps flagging it.
 */
export const rateCorrections = (
  history: EcbHistory | undefined,
  state: LedgerState,
  events: readonly LedgerEvent[],
  staleDays: number,
): RateCorrection[] =>
  [...fiscalPoints(state, events).values()].flatMap(({ event_id, point }) => {
    const official = officialOf(history, point, staleDays);
    const rateDate = point.rate_date as CivilDate;
    const wrongDay =
      point.currency === "EUR"
        ? compareCivilDates(rateDate, point.reference) > 0
        : official !== undefined && official.date !== rateDate;
    return official === undefined || !wrongDay
      ? []
      : [
          {
            event_id,
            path: point.path,
            datePath: point.datePath,
            currency: point.currency,
            rate: point.rate as string,
            rate_date: rateDate,
            fiscal_date: point.reference,
            official,
          },
        ];
  });

/** A recorded event as a draft again: without its envelope, its fingerprint or its link. */
const draftOf = (event: LedgerEvent): Record<string, unknown> => {
  const {
    schema_version: _version,
    id: _id,
    recorded_at: _recorded,
    corrects_id: _corrects,
    fingerprint: _fingerprint,
    ...rest
  } = event as LedgerEvent & { corrects_id?: string; fingerprint?: string };
  return rest;
};

export interface PreparedRateCorrections {
  corrections: RateCorrection[];
  /** What would be appended, in this order, in one write: each reversal followed by its correction. */
  chain: LedgerEvent[];
  /** The ledger as it would be after the chain. */
  state: LedgerState;
  etag: string;
  events: readonly LedgerEvent[];
}

/**
 * Builds the chain that corrects every line of `rateCorrections` (only those
 * of `only`, when given) and checks it **as it will be written**: over the
 * ledger as loaded, with the check every rectification runs. A line whose
 * correction would leave another event invalid refuses the whole chain, with
 * the events it would break (`DependentEventsError`), and nothing is written.
 */
export const prepareRateCorrections = async (
  deps: UseCaseDeps,
  history: EcbHistory | undefined,
  staleDays: number,
  reason: string,
  only?: readonly string[],
): Promise<PreparedRateCorrections> => {
  const { events, etag } = await deps.store.load();
  const now = projectLedger(events, { collectErrors: true });
  const corrections = rateCorrections(history, now, events, staleDays).filter(
    (line) => only === undefined || only.includes(line.event_id),
  );
  const ids = createUlidGenerator(deps);
  const chain: LedgerEvent[] = [];
  for (const id of [...new Set(corrections.map((line) => line.event_id))]) {
    const original = events.find((event) => event.id === id) as LedgerEvent;
    const replacement: Record<string, unknown> = JSON.parse(JSON.stringify(draftOf(original)));
    for (const line of corrections.filter((entry) => entry.event_id === id)) {
      setPath(replacement, line.path, line.official.rate);
      setPath(replacement, line.datePath, line.official.date);
    }
    replacement.corrects_id = id;
    chain.push(
      completeDraft<ReversalEvent>(deps, { type: "reversal", reverses_id: id, reason }, ids.next()),
      completeDraft<SupportedEvent>(
        deps,
        replacement as unknown as Draft<SupportedEvent>,
        ids.next(),
      ),
    );
  }
  const state = checkCandidate(
    events,
    [...events, ...chain],
    chain.map((event) => event.id),
    corrections[0]?.event_id ?? "",
  );
  return { corrections, chain, state, etag, events };
};

/** Writes a prepared chain **in one write**, on the etag it was prepared on. */
export const writeRateCorrections = async (
  deps: UseCaseDeps,
  prepared: PreparedRateCorrections,
): Promise<{ etag: string }> => deps.store.append(prepared.chain, prepared.etag);
