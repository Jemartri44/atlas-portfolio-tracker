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

import type { Ulid } from "../ids/ulid.js";
import { createUlidGenerator } from "../ids/ulid.js";
import { fiscalLots } from "../projections/lots.js";
import { type PhysicalPosition, physicalPositions } from "../projections/positions.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { FiscalLot, LedgerState, RealizedGain, Warning } from "../projections/state.js";
import type { AssetId, Draft, LedgerEvent, SupportedEvent } from "../schema/events.js";
import type { UseCaseDeps } from "./deps.js";
import { checkInvalid, completeDraft, duplicatesOf, type RecordOptions } from "./record-event.js";

/** Positions and open lots of the assets a candidate touches, at one point in time. */
export interface EventEffect {
  positions: PhysicalPosition[];
  lots: FiscalLot[];
}

export interface EventPreview<E extends SupportedEvent = SupportedEvent> {
  /** The event as it would be written: envelope and fingerprint included. */
  candidate: E;
  before: EventEffect;
  after: EventEffect;
  /** Gains the candidate itself would book. */
  gains: RealizedGain[];
  /** Warnings the candidate itself raises. */
  warnings: Warning[];
  /** Ids of the recorded events carrying the same fingerprint; writing needs confirmation. */
  duplicates: Ulid[];
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
  return {
    candidate,
    before: effectOf(before, assets),
    after: effectOf(after, assets),
    gains: after.gains.filter((gain) => gain.event_id === candidate.id),
    warnings: after.warnings.filter((warning) => warning.event_id === candidate.id),
    duplicates: duplicatesOf(before.fingerprints, candidate),
    newlyInvalid: affected.map((entry) => ({ ...entry })),
    events,
    state: before,
    etag,
  };
};
