// The store of a device's sync state (ADR-0026, Part B): the port each client
// brings — the console's folder under its lock, the web's IndexedDB in one
// transaction — and the one the shared orchestration of the seven steps talks
// to. Behind `@atlas/domain/sync`, never the barrel.

import type { DiscardedRecord, HeldRecord } from "../sync/held.js";
import type { SyncMarker, SyncPresence } from "../sync/marker.js";
import type { LoadedLedger } from "./ledger-store.js";

/** The device as its store reads it, raw: step 6 demands it has not changed. */
export interface DeviceState {
  readonly ledger: LoadedLedger;
  readonly presence: SyncPresence;
  /** The exact text of the marker, or `undefined` when there is none. */
  readonly markerText: string | undefined;
  /** The exact text of what is held back and of what was discarded ("" when none). */
  readonly heldText: string;
  readonly discardedText: string;
}

/**
 * What one write of the store changes. **Not a fixed order**: a store writes
 * the destination of every line that moves before its origin forgets it
 * (review of PR #83, B1), so the order follows the direction of each move —
 * held back: `held` gains it, then the ledger loses it; confirmed: the ledger
 * gains it, then a `resolved` record releases it; discarded or redone:
 * `discarded` gains it, then it is resolved. A cut between two writes leaves
 * a line in both places, never in none.
 */
export interface DeviceChange {
  readonly held?: readonly HeldRecord[];
  readonly discarded?: readonly DiscardedRecord[];
  readonly ledger?:
    | { readonly append: readonly string[] }
    | { readonly replace: readonly string[]; readonly archive: string }
    | undefined;
  readonly marker?: SyncMarker;
}

/**
 * `commit` writes a change **only if** the ledger, the marker and what is held
 * back and discarded are exactly as `expected`, all in one hold of the lock or
 * one transaction, and throws ConflictError otherwise, writing nothing. What
 * is held back is written and made durable **before** the ledger loses the
 * line.
 */
export interface SyncStateStore {
  read(): Promise<DeviceState>;
  commit(expected: DeviceState, change: DeviceChange): Promise<void>;
}
