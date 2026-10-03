// The remote ledger as the jobs read it (feature 016): its bytes from the
// bucket, read only — the jobs never write it — decoded as strict UTF-8, its
// lines through the domain's decoder and projected. **What does not load is a
// code, never an exception that stops a job**: the monthly reminder arrives
// with an invalid ledger too, saying what it could not compute (R8).

import { appendOnlyLedger, DependencyUnavailable, type ObjectStore } from "@atlas/adapters/aws";
import {
  type CivilDate,
  CURRENT_LEDGER_SCHEMA,
  DomainError,
  decodeLines,
  type LedgerEvent,
  type LedgerState,
  projectLedger,
  type Settings,
  settingsAt,
} from "@atlas/domain";
import { linesOfText } from "@atlas/domain/sync";

export type JobLedger =
  | {
      readonly ok: true;
      readonly events: readonly LedgerEvent[];
      readonly state: LedgerState;
      readonly settings: Settings;
    }
  | { readonly ok: false; readonly code: string };

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export const loadLedger = async (objects: ObjectStore, today: CivilDate): Promise<JobLedger> => {
  let bytes: Uint8Array;
  try {
    bytes = await appendOnlyLedger(objects).read();
  } catch (error) {
    return {
      ok: false,
      code: error instanceof DependencyUnavailable ? "ledger_unavailable" : "ledger_unreadable",
    };
  }
  return ledgerOfBytes(bytes, today);
};

/**
 * A ledger from its bytes: the remote one, or the one of a monthly dump (E4).
 * Empty is absent; what does not decode or project cleanly is a code.
 */
export const ledgerOfBytes = (bytes: Uint8Array, today: CivilDate): JobLedger => {
  if (bytes.length === 0) {
    return { ok: false, code: "ledger_absent" };
  }
  try {
    const events = decodeLines(linesOfText(utf8.decode(bytes)), CURRENT_LEDGER_SCHEMA);
    const state = projectLedger(events, { collectErrors: true, asOf: today });
    if (state.invalid.length > 0) {
      return { ok: false, code: "ledger_invalid" };
    }
    return { ok: true, events, state, settings: settingsAt(state, today).settings };
  } catch (error) {
    return {
      ok: false,
      code:
        error instanceof DomainError && /^[a-z][a-z0-9_]{0,63}$/.test(error.code)
          ? error.code
          : "ledger_unreadable",
    };
  }
};
