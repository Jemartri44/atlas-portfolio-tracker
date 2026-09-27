// What the monthly reminder values with (feature 016, §8.2 M6): the closes of
// `prices/` and the ECB history of the bucket, read **only** through the
// `ReferenceReader` of the 015, which cannot write nor read outside those two
// prefixes. Until E2 writes them in the cloud there may be nothing, and then
// the reminder values with the manual valuations alone. Everything degrades:
// a file that does not read leaves its asset without an automatic price; a
// history whose bytes do not match its manifest is **not used**, and every
// quote not in euros stays without a value in euros. Never an invented rate.

import { createHash } from "node:crypto";
import { type ObjectStore, referenceReader } from "@atlas/adapters/aws";
import type { AssetId, ExternalPrices, LedgerState } from "@atlas/domain";
import { DEFAULT_LOCAL_CONFIG, readEcbHistory } from "@atlas/domain/ecb";
import { activeHistoryOf } from "@atlas/domain/jobs";
import { externalPricesOf, parseSymbols, priceFileName, readCloses } from "@atlas/domain/quotes";

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const textOf = (bytes: Uint8Array): string | undefined => {
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
};

export interface ReferenceRead {
  readonly external?: ExternalPrices;
  readonly counts: { readonly price_files: number; readonly ecb_history: number };
}

const historyOf = async (reader: ReturnType<typeof referenceReader>) => {
  const manifest = await reader.get("reference/ecb/manifest.json");
  const active = manifest === undefined ? undefined : activeHistoryOf(textOf(manifest.body) ?? "");
  if (active === undefined) {
    return undefined;
  }
  const file = await reader.get(`reference/ecb/${active.file}`);
  if (
    file === undefined ||
    createHash("sha256").update(file.body).digest("hex") !== active.sha256
  ) {
    return undefined;
  }
  const text = textOf(file.body);
  return text === undefined ? undefined : readEcbHistory(text, active.source);
};

export const readReference = async (
  objects: ObjectStore,
  state: LedgerState,
): Promise<ReferenceRead> => {
  const reader = referenceReader(objects);
  const files = new Map<AssetId, string>();
  for (const assetId of state.assets.keys()) {
    const stored = await reader.get(`prices/${priceFileName(assetId)}`).catch(() => undefined);
    const text = stored === undefined ? undefined : textOf(stored.body);
    if (text !== undefined) {
      files.set(assetId, text);
    }
  }
  const history = await historyOf(reader).catch(() => undefined);
  const counts = { price_files: files.size, ecb_history: history === undefined ? 0 : 1 };
  if (files.size === 0) {
    return { counts };
  }
  try {
    const stored = await reader.get("prices/symbols.json");
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
        staleDays: DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days,
      }),
      counts,
    };
  } catch {
    // A correspondence that does not read cannot say which closes are in the
    // wrong currency: no automatic prices, as in the console (feature 013).
    return { counts: { ...counts, price_files: 0 } };
  }
};
