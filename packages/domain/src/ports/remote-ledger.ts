// The remote copy of the ledger, as the sync sees it (ADR-0026; `docs/api.md`
// §5). In feature 014 it is implemented only by the simulated remotes of the
// tests; the HTTP client of feature 015 implements it over the API. The
// semantics are the API's: the etag is the SHA-256 of the bytes, every write
// is conditional, and a line is rejected on its own inside a successful answer.

import { DomainError } from "../errors.js";

/**
 * The remote ledger as downloaded (`docs/api.md` §5.1): its text, decoded from
 * its exact UTF-8 bytes (the domain has no decoder of its own; every line was
 * written from a string, so decoding loses nothing), and the etag of those
 * bytes.
 */
export interface RemoteSnapshot {
  readonly text: string;
  /** SHA-256 hex of the bytes; of zero bytes when the remote is empty or absent. */
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
 * Every code a request of the sync can fail with, **closed**: those of
 * `docs/api.md` §7 the routes of §5 can answer, and the two the client names
 * for what never reached the API. None of them holds a line back (V4); each
 * is translated on its own by both interfaces.
 */
export const REMOTE_FAILURE_CODES = [
  "unauthenticated",
  "credentials_ambiguous",
  "session_invalid",
  "device_token_invalid",
  "device_token_revoked",
  "device_token_expired",
  "not_allowed",
  "forbidden_for_credential",
  "origin_rejected",
  "body_invalid",
  "body_not_json",
  "precondition_required",
  "precondition_failed",
  "init_rejected",
  "not_found",
  "internal",
  "transport_rejected",
  "network_failed",
] as const;

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
