// `@atlas/adapters/prices`: the automatic daily closes **as the web reads
// them** (feature 013, block 5). The web downloads nothing and writes nothing
// in the folder: on the desktop it reads `prices/` from the folder linked for
// reading, where the console wrote it; on the phone — or without a folder —
// the files the user **imported by hand**, kept in this browser under a key of
// their own of the existing store, without raising the version of the
// database (which is opened at boot). Loaded lazily: nothing of the prices is
// on the boot path.

import type { AssetId } from "@atlas/domain";
import { priceFileName } from "@atlas/domain/quotes";
import { readFolderText } from "./folder.js";
import { idbGet, idbPut, LEDGER_STORE } from "./idb.js";

const KEY = "prices:imported";

export interface ImportedPrices {
  /** The text of each `prices/<asset_id>.jsonl`, by asset, exactly as imported. */
  readonly files: Readonly<Record<AssetId, string>>;
  /** ISO 8601 UTC of the last import. */
  readonly imported_at: string;
}

/** The files of `prices/` of the assets given, from the folder; absent files are skipped. */
export const readFolderPrices = async (
  folder: FileSystemDirectoryHandle,
  assetIds: Iterable<AssetId>,
): Promise<Map<AssetId, string>> => {
  const files = new Map<AssetId, string>();
  for (const assetId of assetIds) {
    const text = await readFolderText(folder, ["prices", priceFileName(assetId)]);
    if (text !== undefined) {
      files.set(assetId, text);
    }
  }
  return files;
};

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
