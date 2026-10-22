// `@atlas/adapters/prices`: the daily closes the user **imported by hand**,
// kept in this browser under a key of their own of the existing store, without
// raising the version of the database (which is opened at boot). Loaded
// lazily: nothing of the prices is on the boot path.

import type { AssetId } from "@atlas/domain";
import { idbGet, idbPut, LEDGER_STORE } from "./idb.js";

/** The key of the prices imported by hand, in the `ledger` store. */
export const IMPORTED_PRICES_KEY = "prices:imported";
const KEY = IMPORTED_PRICES_KEY;

export interface ImportedPrices {
  /** The text of each `prices/<asset_id>.jsonl`, by asset, exactly as imported. */
  readonly files: Readonly<Record<AssetId, string>>;
  /** ISO 8601 UTC of the last import. */
  readonly imported_at: string;
  /**
   * The text of `prices/symbols.json` imported with them, exactly as imported:
   * what says which closes are stored in a currency their source does not
   * declare. Absent when never imported.
   */
  readonly symbols?: string;
}

/** The asset of a file of `prices/`, from its name; `undefined` for any other file. */
export const assetOfPriceFile = (name: string): AssetId | undefined => {
  if (!name.endsWith(".jsonl")) {
    return undefined;
  }
  try {
    return decodeURIComponent(name.slice(0, -".jsonl".length));
  } catch {
    return undefined;
  }
};

export const saveImportedPrices = (prices: ImportedPrices): Promise<void> =>
  idbPut(LEDGER_STORE, KEY, prices);

export const importedPrices = (): Promise<ImportedPrices | undefined> =>
  idbGet<ImportedPrices>(LEDGER_STORE, KEY);

/**
 * Deletes the prices imported by hand: the manual prices and the ledger are
 * untouched. Written as an empty value and not with `idbDelete`, which nothing
 * on the boot path used: importing it put it in the chunk the first screen
 * downloads (+35 bytes, measured).
 */
export const forgetImportedPrices = (): Promise<void> => idbPut(LEDGER_STORE, KEY, undefined);
