import type { LedgerEvent } from "../schema/events.js";

export interface LoadedLedger {
  /** Every event in file order (the canonical storage order). */
  readonly events: readonly LedgerEvent[];
  /** Opaque version of the store; `append` succeeds only if it still matches. */
  readonly etag: string;
}

/**
 * Loads and appends to the ledger with optimistic concurrency (data-schema.md §5).
 * Implementations never re-serialise existing lines and reject newer schema versions.
 */
export interface LedgerStore {
  load(): Promise<LoadedLedger>;
  /** Appends `events` at the end. Throws ConflictError when `etag` is stale. */
  append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }>;
}
