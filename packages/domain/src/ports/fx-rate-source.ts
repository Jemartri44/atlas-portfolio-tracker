import type { EcbSource } from "../ecb/history.js";

/**
 * The ECB history as it was downloaded (ADR-0029, point 1): the CSV **byte for
 * byte** — the one inside the ZIP, or the API's — with where it came from.
 * What comes from the API is never presented as the ZIP (decision (l) of
 * prompt 012).
 */
export interface DownloadedHistory {
  readonly source: EcbSource;
  readonly bytes: Uint8Array;
  readonly url: string;
  /** ISO 8601 UTC. */
  readonly fetched_at: string;
  /** Why the ZIP, which is preferred, could not be used, when the API was. */
  readonly zip_failure?: string;
}

/**
 * Downloads the official history. Asynchronous and the only thing with a
 * network: an adapter per source, **outside** everything the web bundles.
 */
export interface FxRateSource {
  download(): Promise<DownloadedHistory>;
}

/** What is known of a stored history. */
export interface StoredHistoryMeta {
  /** File name inside `reference/ecb/`. */
  readonly file: string;
  readonly source: EcbSource;
  readonly url: string;
  readonly fetched_at: string;
  /** SHA-256 of the bytes, to know the file is the one recorded. */
  readonly sha256: string;
}

export interface StoredHistory {
  readonly meta: StoredHistoryMeta;
  readonly text: string;
}

/**
 * Where the history lives: `reference/ecb/` next to the ledger. Every write is
 * one step under the lock of the folder, and nothing is ever overwritten
 * without keeping what was there.
 */
export interface EcbHistoryStore {
  /** The history in force; `undefined` when none was ever stored. */
  active(): Promise<StoredHistory | undefined>;
  /** Makes `next` the history in force; the previous one is kept as a backup. */
  activate(next: DownloadedHistory): Promise<StoredHistoryMeta>;
  /** Keeps a download that did not validate, **without** touching the one in force. */
  keepRejected(next: DownloadedHistory): Promise<StoredHistoryMeta>;
}
