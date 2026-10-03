// What the monthly reminder values with (feature 016, §8.2 M6): the closes of
// `prices/` and the ECB history of the bucket, read **only** through the
// `ReferenceReader` of the 015, which cannot write nor read outside those two
// prefixes. Until E2 writes them in the cloud there may be nothing, and then
// the reminder values with the manual valuations alone. Everything degrades:
// a file that does not read leaves its asset without an automatic price; a
// history whose bytes do not match its manifest is **not used**, and every
// quote not in euros stays without a value in euros. Never an invented rate.

import { type ObjectStore, referenceReader } from "@atlas/adapters/aws";
import type { AssetId, ExternalPrices, LedgerState } from "@atlas/domain";
import { externalPricesOf, parseSymbols, priceFileName, readCloses } from "@atlas/domain/quotes";
import { CLOUD_ECB_STALE_DAYS, historyOf, readCloudEcbHistory, textOf } from "./ecb-history.js";

export interface ReferenceRead {
  readonly external?: ExternalPrices;
  readonly counts: { readonly price_files: number; readonly ecb_history: number };
}

export const readReference = async (
  objects: ObjectStore,
  state: LedgerState,
): Promise<ReferenceRead> => {
  const reader = referenceReader(objects);
  const files = new Map<AssetId, string>();
  for (const assetId of state.assets.keys()) {
    // A read that fails throws: a passing failure, never «no price» (R2, weekly review).
    const stored = await reader.get(`prices/${priceFileName(assetId)}`);
    const text = stored === undefined ? undefined : textOf(stored.body);
    if (text !== undefined) {
      files.set(assetId, text);
    }
  }
  const history = historyOf(await readCloudEcbHistory(objects));
  const counts = { price_files: files.size, ecb_history: history === undefined ? 0 : 1 };
  if (files.size === 0) {
    return { counts };
  }
  const stored = await reader.get("prices/symbols.json");
  try {
    const text = stored === undefined ? undefined : textOf(stored.body);
    if (stored !== undefined && text === undefined) {
      throw new RangeError("prices/symbols.json is not UTF-8");
    }
    const symbols = parseSymbols(text);
    const read = readCloses(files, symbols);
    return {
      external: externalPricesOf(state, {
        closes: read.closes,
        ...(history === undefined ? {} : { history }),
        staleDays: CLOUD_ECB_STALE_DAYS,
      }),
      counts,
    };
  } catch {
    // A correspondence that does not read cannot say which closes are in the
    // wrong currency: no automatic prices, as in the console (feature 013).
    return { counts: { ...counts, price_files: 0 } };
  }
};
