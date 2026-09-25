import type { AssetId } from "../schema/events.js";

/**
 * What the store of prices holds next to the ledger (`prices/`): the text of
 * each file, parsed by the domain. Reading outside a transaction is only ever
 * a hint; whatever decides a write is read again inside one.
 */
export interface PriceFiles {
  /** `prices/config.json`, written by the user; `undefined` when absent. */
  config(): Promise<string | undefined>;
  /** `prices/symbols.json`; `undefined` when absent. */
  symbols(): Promise<string | undefined>;
  /** `prices/_status.json`; `undefined` when absent. */
  status(): Promise<string | undefined>;
  /** `prices/<asset_id>.jsonl`; `undefined` when absent. */
  closes(assetId: AssetId): Promise<string | undefined>;
}

/**
 * A transaction over `prices/`: the reads see the files as they are **now**,
 * under the lock of the folder, and the writes happen before it is released.
 * Checking and writing always go together (§2 ter of prompt 013).
 */
export interface PriceTransaction extends PriceFiles {
  /** Appends lines at the end of `prices/<asset_id>.jsonl`; never rewrites a byte already there. */
  appendCloses(assetId: AssetId, lines: readonly string[]): Promise<void>;
  /** Replaces `prices/_status.json`. */
  writeStatus(text: string): Promise<void>;
  /** Replaces `prices/symbols.json`. */
  writeSymbols(text: string): Promise<void>;
}

/**
 * Where prices live (ADR-0031, «Almacén»): every write in `prices/` goes
 * through here, as the ledger goes through `LedgerStore`. **No network call
 * may happen inside `transact`**: a download of twenty symbols must never
 * keep `atlas add` waiting for the lock.
 */
export interface PriceStore extends PriceFiles {
  transact<T>(work: (tx: PriceTransaction) => Promise<T>): Promise<T>;
}
