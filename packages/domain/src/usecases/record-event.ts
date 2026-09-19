// Records one event: completes the envelope and the fingerprint, validates the
// shape, projects the ledger with the new event placed chronologically and
// appends only if every invariant still holds (data-schema.md §7.1).

import type { AffectedEvent } from "../errors.js";
import {
  DependentEventsError,
  DuplicateFingerprintError,
  InvalidLedgerError,
  ValidationError,
} from "../errors.js";
import { createUlidGenerator } from "../ids/ulid.js";
import { normalizeIsin } from "../projections/isin.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { LedgerState, Warning } from "../projections/state.js";
import { CURRENT_SCHEMA_VERSION } from "../schema/envelope.js";
import type { Draft, LedgerEvent, SupportedEvent } from "../schema/events.js";
import { fingerprintOf } from "../schema/fingerprint.js";
import { validateShape } from "../schema/validate.js";
import type { UseCaseDeps } from "./deps.js";
import { describeAffected, newlyInvalid } from "./invalid-events.js";

export interface RecordOptions {
  /** Write even if another event carries the same fingerprint. */
  confirmDuplicate?: boolean;
  /**
   * Write a `settings_changed` even though it leaves recorded events invalid
   * (ADR-0015). Admitted for no other event type: the facts do not change, only
   * their reading, so there is nothing to rectify first.
   */
  acceptInvalid?: boolean;
}

export interface RecordResult<E extends SupportedEvent = SupportedEvent> {
  event: E;
  warnings: Warning[];
  etag: string;
  /** Events that were valid before and are not after; only ever non-empty with `acceptInvalid`. */
  newlyInvalid: AffectedEvent[];
}

/** Envelope + fingerprint on top of a draft. Exported for correctEvent. */
export const completeDraft = <E extends SupportedEvent>(
  deps: Pick<UseCaseDeps, "clock" | "random">,
  draft: Draft<E>,
  id: string,
): E => {
  const candidate = {
    schema_version: CURRENT_SCHEMA_VERSION,
    id,
    recorded_at: deps.clock.now().toISOString(),
    ...draft,
  } as unknown as E;
  const fingerprint = fingerprintOf(candidate);
  const event =
    draft.fingerprint === undefined && fingerprint !== undefined
      ? { ...candidate, fingerprint }
      : candidate;
  return validateShape(event) as E;
};

export const duplicatesOf = (
  fingerprints: ReadonlyMap<string, string[]>,
  event: LedgerEvent,
): string[] => {
  const fingerprint = (event as { fingerprint?: string }).fingerprint;
  if (fingerprint === undefined) {
    return [];
  }
  return (fingerprints.get(fingerprint) ?? []).filter((id) => id !== event.id);
};

/**
 * One ISIN, one asset (ADR-0009, feature 009 review): FIFO and the wash-sale
 * rule work on homogeneous securities, and the system knows them by
 * `asset_id`. Two assets with the same ISIN — the same ETF in the core and in
 * the bucket, say — are one security to the tax agency and two to the engine:
 * a loss in one and a repurchase in the other fourteen days later is computed
 * whole when it should be deferred whole, aggressively and in silence.
 *
 * Checked **when an ISIN is introduced**: an `asset_created` that carries one,
 * or an `asset_updated` that changes it, recorded or written as a correction.
 * Never on load and never in the projection: a ledger already written with a
 * duplicate must stay readable (ADR-0018), and `integrity` reports it instead.
 * An update that keeps the ISIN it had is not blocked either, so such a ledger
 * can still be repaired.
 *
 * Against the **catalogue in force** of the candidate ledger, not the raw
 * lines: a reversed `asset_created` holds no ISIN, and neither does a reversed
 * change (verifier of feature 009). And the ISIN compared as the tax agency
 * reads it, upper case and without spaces. `before` is only projected when
 * there is a clash, to tell an update that keeps its own ISIN from one that
 * takes another's.
 */
export const checkIsinUnique = (
  after: LedgerState,
  event: SupportedEvent,
  before: () => LedgerState,
): void => {
  if (
    (event.type !== "asset_created" && event.type !== "asset_updated") ||
    event.isin === undefined
  ) {
    return;
  }
  const isin = normalizeIsin(event.isin);
  const holder = [...after.assets.values()].find(
    (asset) =>
      asset.asset_id !== event.asset_id &&
      asset.isin !== undefined &&
      normalizeIsin(asset.isin) === isin,
  );
  if (holder === undefined) {
    return;
  }
  const own = before().assets.get(event.asset_id)?.isin;
  if (event.type === "asset_updated" && own !== undefined && normalizeIsin(own) === isin) {
    return;
  }
  throw new ValidationError(
    "duplicate_isin",
    `ISIN ${event.isin} already belongs to asset ${holder.asset_id}; record the operations on that asset`,
    { isin: event.isin, asset_id: event.asset_id, existing_asset_id: holder.asset_id },
  );
};

/**
 * Decides whether the candidate ledger may be written (ADR-0015). Everything
 * but `settings_changed` still demands a valid ledger, exactly as before; a
 * `settings_changed` only has to leave no *new* invalid event, unless the
 * caller accepts them explicitly.
 *
 * Exported because `previewEvent` has to fail **exactly** where the write would
 * fail: a preview that accepts what `recordEvent` rejects (or that blames the
 * wrong event) is worse than no preview at all.
 */
export const checkInvalid = (
  events: readonly LedgerEvent[],
  event: SupportedEvent,
  options: RecordOptions,
): { affected: AffectedEvent[]; state: LedgerState } => {
  const candidate = [...events, event];
  const { fresh, all, state } = newlyInvalid(events, candidate);
  const own = all.find((entry) => entry.event.id === event.id);
  if (own !== undefined) {
    throw own.error;
  }
  checkIsinUnique(state, event, () => projectLedger(events));
  if (event.type !== "settings_changed") {
    /*
     * An event that was already invalid before this mutation blocks it, but it
     * is not this event's fault: raising its error bare (say,
     * `insufficient_position`) reads as an accusation against the buy being
     * recorded. Name the culprit instead. An event the candidate itself breaks
     * keeps raising its own error, which already identifies it (ADR-0003).
     */
    const preexisting = all.find((entry) => !fresh.includes(entry));
    if (preexisting !== undefined) {
      throw new InvalidLedgerError(describeAffected([preexisting])[0] as AffectedEvent, all.length);
    }
    const broken = fresh[0];
    if (broken !== undefined) {
      throw broken.error;
    }
    return { affected: [], state };
  }
  const affected = describeAffected(fresh);
  if (affected.length > 0 && options.acceptInvalid !== true) {
    throw new DependentEventsError(event.id, affected, "newly_invalid_events");
  }
  return { affected, state };
};

export const recordEvent = async <E extends SupportedEvent>(
  deps: UseCaseDeps,
  draft: Draft<E>,
  options: RecordOptions = {},
): Promise<RecordResult<E>> => {
  const { events, etag } = await deps.store.load();
  const event = completeDraft<E>(deps, draft, createUlidGenerator(deps).next());
  if (options.acceptInvalid === true && event.type !== "settings_changed") {
    throw new ValidationError(
      "accept_invalid_not_allowed",
      "only a settings_changed may be recorded over events it invalidates",
      { type: event.type },
    );
  }
  const { affected, state } = checkInvalid(events, event, options);
  const duplicates = duplicatesOf(state.fingerprints, event);
  if (duplicates.length > 0 && options.confirmDuplicate !== true) {
    throw new DuplicateFingerprintError((event as { fingerprint: string }).fingerprint, duplicates);
  }
  const appended = await deps.store.append([event], etag);
  return {
    event,
    warnings: state.warnings.filter((warning) => warning.event_id === event.id),
    etag: appended.etag,
    newlyInvalid: affected,
  };
};
