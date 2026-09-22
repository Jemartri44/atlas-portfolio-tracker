// What would happen if I recorded this (decision (h) of prompt 006).
//
// It lived in the CLI, where the wizards print positions and lots before and
// after. The web needs exactly the same thing, so it lives here: one definition
// of "what this event would do", consumed by both interfaces and going through
// the **same check** `recordEvent` uses to accept or reject (`checkInvalid`). A
// preview that accepts what the write rejects, or that blames the wrong event,
// is worse than no preview at all.
//
// It writes nothing and mutates nothing. A domain error is thrown, not
// swallowed: it is the very error `recordEvent` would raise, with its `code`
// and its `details`, so the interface has nothing to interpret. The duplicate
// fingerprint is the one exception: it is **returned**, because deciding
// whether a repetition is legitimate is the user's call (ADR-0012), and the
// interface has to be able to ask before writing.

import { todayInMadrid } from "../dates/madrid.js";
import { type ClosedYear, closedYearsTouched, unfiledPastYears } from "../filings/touched.js";
import type { Ulid } from "../ids/ulid.js";
import { createUlidGenerator } from "../ids/ulid.js";
import { type Currency, Money } from "../money/money.js";
import { fiscalLots } from "../projections/lots.js";
import { type PhysicalPosition, physicalPositions } from "../projections/positions.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { FiscalLot, LedgerState, RealizedGain, Warning } from "../projections/state.js";
import type { AccountId, AssetId, Draft, LedgerEvent, SupportedEvent } from "../schema/events.js";
import type { UseCaseDeps } from "./deps.js";
import { checkInvalid, completeDraft, duplicatesOf, type RecordOptions } from "./record-event.js";
import { prepareCorrection } from "./rectify.js";

/** Positions and open lots of the assets a candidate touches, at one point in time. */
export interface EventEffect {
  positions: PhysicalPosition[];
  lots: FiscalLot[];
}

/** The cash of one account in one currency, before and after the candidate. */
export interface CashChange {
  account_id: AccountId;
  currency: Currency;
  before: Money;
  after: Money;
}

export interface EventPreview<E extends SupportedEvent = SupportedEvent> {
  /** The event as it would be written: envelope and fingerprint included. */
  candidate: E;
  before: EventEffect;
  after: EventEffect;
  /**
   * The cash the candidate moves: every account and currency whose balance
   * would change, before and after. A purchase that leaves the account short
   * says so here, before it is written; one that moves no cash has none.
   */
  cash: CashChange[];
  /** Gains the candidate itself would book. */
  gains: RealizedGain[];
  /** Warnings the candidate itself raises. */
  warnings: Warning[];
  /** Ids of the recorded events carrying the same fingerprint; writing needs confirmation. */
  duplicates: Ulid[];
  /**
   * The tax years already filed that writing this would reach, and the past
   * years with figures and no return recorded. The same two the write returns:
   * a preview that does not warn where the write warns sends the user into the
   * write to be surprised there (plan §1.6).
   */
  closed: ClosedYear[];
  unfiledPastYears: number[];
  /** Events already recorded that the candidate would leave invalid (only a settings change can). */
  newlyInvalid: { id: Ulid; type: string; error: string }[];
  /** The ledger as loaded and projected (degraded mode), so nobody projects it again. */
  events: readonly LedgerEvent[];
  state: LedgerState;
  etag: string;
}

/** Assets the event refers to, when the caller does not name them. */
const assetsOf = (event: SupportedEvent): AssetId[] => {
  const fields = event as { asset_id?: AssetId; from_asset_id?: AssetId; to_asset_id?: AssetId };
  const ids = [fields.asset_id, fields.from_asset_id, fields.to_asset_id];
  return [...new Set(ids.filter((id): id is AssetId => id !== undefined))];
};

const effectOf = (state: LedgerState, assets: readonly AssetId[]): EventEffect => ({
  positions: physicalPositions(state).filter((row) => assets.includes(row.asset_id)),
  lots: fiscalLots(state).filter((lot) => assets.includes(lot.asset_id)),
});

const balanceOf = (state: LedgerState, key: string, currency: Currency): Money =>
  state.cash.get(key) ?? Money.zero(currency);

/** Every account and currency whose balance differs, in the order the ledger met them. */
const cashChanges = (before: LedgerState, after: LedgerState): CashChange[] => {
  const changes: CashChange[] = [];
  for (const key of new Set([...before.cash.keys(), ...after.cash.keys()])) {
    const [account_id, currency] = key.split("|") as [AccountId, Currency];
    const was = balanceOf(before, key, currency);
    const now = balanceOf(after, key, currency);
    if (!was.eq(now)) {
      changes.push({ account_id, currency, before: was, after: now });
    }
  }
  return changes;
};

export interface PreviewOptions extends RecordOptions {
  /** Assets whose effect is shown; by default the ones the candidate references. */
  assets?: readonly AssetId[];
}

export const previewEvent = async <E extends SupportedEvent>(
  deps: UseCaseDeps,
  draft: Draft<E>,
  options: PreviewOptions = {},
): Promise<EventPreview<E>> => {
  const { events, etag } = await deps.store.load();
  const candidate = completeDraft<E>(deps, draft, createUlidGenerator(deps).next());
  const { affected, state: after } = checkInvalid(events, candidate, options);
  const before = projectLedger(events, { collectErrors: true });
  const assets = options.assets ?? assetsOf(candidate);
  const today = todayInMadrid(deps.clock);
  return {
    candidate,
    before: effectOf(before, assets),
    after: effectOf(after, assets),
    cash: cashChanges(before, after),
    gains: after.gains.filter((gain) => gain.event_id === candidate.id),
    warnings: after.warnings.filter((warning) => warning.event_id === candidate.id),
    duplicates: duplicatesOf(before.fingerprints, candidate),
    newlyInvalid: affected.map((entry) => ({ ...entry })),
    closed: closedYearsTouched(events, [...events, candidate], today, after),
    unfiledPastYears: unfiledPastYears(today, after),
    events,
    state: before,
    etag,
  };
};

/**
 * What a correction would do: the ledger **with the original reversed and the
 * corrected event in its place**, the very pair `correctEvent` appends and the
 * very check it runs (`prepareCorrection`). Adding the corrected event to the
 * ledger as it is counted the movement twice — a deposit corrected from 8.700
 * to 8.000 € showed 18.092,05 € of cash instead of 9.392,05 — and refused a
 * purchase whose order the original itself had filled (review of 2026-09-19).
 *
 * A dependent event the correction would break is refused here as the write
 * refuses it, so there is nothing to list in `newlyInvalid`. The duplicates are
 * counted on the ledger after the correction, where the original no longer
 * holds its fingerprint: a correction identical to its original repeats nothing.
 */
export const previewCorrection = async <E extends SupportedEvent>(
  deps: UseCaseDeps,
  targetId: string,
  replacement: Draft<E>,
  reason: string,
  options: PreviewOptions = {},
): Promise<EventPreview<E>> => {
  const { events, etag } = await deps.store.load();
  const {
    target,
    reversal,
    event,
    state: after,
  } = prepareCorrection(deps, events, targetId, replacement, reason);
  const before = projectLedger(events, { collectErrors: true });
  const assets = options.assets ?? [
    ...new Set([...assetsOf(target as SupportedEvent), ...assetsOf(event)]),
  ];
  const today = todayInMadrid(deps.clock);
  return {
    candidate: event,
    before: effectOf(before, assets),
    after: effectOf(after, assets),
    cash: cashChanges(before, after),
    gains: after.gains.filter((gain) => gain.event_id === event.id),
    warnings: after.warnings.filter((warning) => warning.event_id === event.id),
    duplicates: duplicatesOf(after.fingerprints, event),
    newlyInvalid: [],
    closed: closedYearsTouched(events, [...events, reversal, event], today, after),
    unfiledPastYears: unfiledPastYears(today, after),
    events,
    state: before,
    etag,
  };
};
