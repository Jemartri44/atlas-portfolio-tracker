// Records one event: completes the envelope and the fingerprint, validates the
// shape, projects the ledger with the new event placed chronologically and
// appends only if every invariant still holds (data-schema.md §7.1).

import { DuplicateFingerprintError } from "../errors.js";
import { createUlidGenerator } from "../ids/ulid.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { Warning } from "../projections/state.js";
import { CURRENT_SCHEMA_VERSION } from "../schema/envelope.js";
import type { Draft, LedgerEvent, SupportedEvent } from "../schema/events.js";
import { fingerprintOf } from "../schema/fingerprint.js";
import { validateShape } from "../schema/validate.js";
import type { UseCaseDeps } from "./deps.js";

export interface RecordOptions {
  /** Write even if another event carries the same fingerprint. */
  confirmDuplicate?: boolean;
}

export interface RecordResult<E extends SupportedEvent = SupportedEvent> {
  event: E;
  warnings: Warning[];
  etag: string;
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

export const recordEvent = async <E extends SupportedEvent>(
  deps: UseCaseDeps,
  draft: Draft<E>,
  options: RecordOptions = {},
): Promise<RecordResult<E>> => {
  const { events, etag } = await deps.store.load();
  const event = completeDraft<E>(deps, draft, createUlidGenerator(deps).next());
  const state = projectLedger([...events, event]);
  const duplicates = duplicatesOf(state.fingerprints, event);
  if (duplicates.length > 0 && options.confirmDuplicate !== true) {
    throw new DuplicateFingerprintError((event as { fingerprint: string }).fingerprint, duplicates);
  }
  const appended = await deps.store.append([event], etag);
  return {
    event,
    warnings: state.warnings.filter((warning) => warning.event_id === event.id),
    etag: appended.etag,
  };
};
