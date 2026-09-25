// The remote copy of the ledger, as the sync sees it (ADR-0026; `docs/api.md`
// §5). In feature 014 it is implemented only by the simulated remotes of the
// tests; the HTTP client of feature 015 implements it over the API. The
// semantics are the API's: the etag is the SHA-256 of the bytes, every write
// is conditional, and a line is rejected on its own inside a successful answer.

import { DomainError } from "../errors.js";

/** The remote ledger as downloaded: its exact bytes and their etag (`docs/api.md` §5.1). */
export interface RemoteSnapshot {
  readonly bytes: Uint8Array;
  /** SHA-256 hex of `bytes`; of zero bytes when the remote is empty or absent. */
  readonly etag: string;
}

/** One entry of an append (`docs/api.md` §5.2): the exact line and its declarations. */
export interface AppendEntry {
  readonly line: string;
  readonly confirm_duplicate?: true;
  readonly has_correction?: true;
  readonly chain_continues?: true;
}

/** The rejection of one line (or unit) inside a successful append. */
export interface LineRejection {
  readonly index: number;
  readonly id?: string;
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface AppendResult {
  readonly etag: string;
  /** Lines of the remote after writing. */
  readonly lines: number;
  /** Entries written, from the first. */
  readonly accepted: number;
  readonly rejected?: LineRejection;
}

/** What a device publishes of its queue (`docs/api.md` §5.3); the device id comes from the credential. */
export interface DeviceQueueState {
  readonly pending: number;
  readonly held: number;
  readonly last_sync_at: string;
}

/**
 * A request that did not get a line-by-line answer. `code` is one of the
 * codes of `docs/api.md` §7 — `precondition_failed` (412) sends the sync back
 * to step 1 — or, for what never reached the API, `transport_rejected` (an
 * answer without the API's error shape) and `network_failed`. Whatever it is,
 * it **never holds a line back** (§6.3 (V4)).
 */
export class RemoteError extends DomainError {
  constructor(
    code: string,
    readonly status: number | undefined,
    details: Record<string, unknown> = {},
  ) {
    super(code, `the remote answered ${code}`, details);
  }
}

export interface RemoteLedger {
  read(): Promise<RemoteSnapshot>;
  /** Appends on `ifMatch`, the etag of the remote the client downloaded. */
  append(entries: readonly AppendEntry[], ifMatch: string): Promise<AppendResult>;
  /** Initialises an **empty** remote with the whole bytes of a ledger (`docs/api.md` §5.5). */
  init(
    content: string,
    confirmDuplicateIds: readonly string[],
    ifMatch: string,
  ): Promise<{ etag: string; lines: number }>;
  /** Publishes the state of this device's queue. */
  publish(state: DeviceQueueState): Promise<{ device_id: string; published_at: string }>;
}
