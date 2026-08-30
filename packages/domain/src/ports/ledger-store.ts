import type { LedgerEvent } from "../schema/events.js";
import type { LedgerSchema } from "../schema/migrations/index.js";

export interface LoadedLedger {
  /** Every event in file order (the canonical storage order), migrated in memory. */
  readonly events: readonly LedgerEvent[];
  /** Opaque version of the store; `append` and `replace` succeed only if it still matches. */
  readonly etag: string;
  /** The raw lines exactly as stored, without trailing newlines, in file order (`lines.length === events.length`). */
  readonly lines: readonly string[];
}

/**
 * Loads, appends to and (only for `compact`) replaces the ledger with optimistic
 * concurrency (data-schema.md §5). Implementations never re-serialise existing
 * lines on `append`, reject newer schema versions and never overwrite an archive.
 */
export interface LedgerStore {
  /** Schema used to decode lines: the current one, or a test schema. */
  readonly schema: LedgerSchema;
  load(): Promise<LoadedLedger>;
  /** Appends `events` at the end. Throws ConflictError when `etag` is stale. */
  append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }>;
  /**
   * Replaces the whole content by `events`, canonically serialised, only after
   * saving the current bytes verbatim under `archiveName`. Throws ConflictError
   * when `etag` is stale and ArchiveExistsError when the archive already exists;
   * in both cases nothing is written.
   */
  replace(
    events: readonly LedgerEvent[],
    etag: string,
    archiveName: string,
  ): Promise<{ etag: string }>;
}
