// Where the web gets the automatic daily closes (feature 013, block 5).
//
// **The web downloads nothing and writes nothing in the folder.** On the
// desktop it reads `prices/` from the folder linked for reading — what the
// console downloaded — and converts with the ECB history it already reads from
// the same folder; on the phone, or without a folder, the files **imported by
// hand**. On the phone there are no automatic prices until the cloud exists
// (features 014-016): said as such, not softened.
//
// The console downloads the prices **of the assets of its own ledger** (P5):
// an asset created only in this web has no automatic price until it reaches
// the console's ledger (export and import) or the sync exists.
//
// Loaded lazily: nothing of it is on the boot path, and the build fails if it
// ever is.

import { queryFolderPermission, readFolderText, rememberedFolder } from "@atlas/adapters/folder";
import {
  assetOfPriceFile,
  forgetImportedPrices,
  importedPrices,
  readFolderPrices,
  saveImportedPrices,
} from "@atlas/adapters/prices";
import type { AssetId, ExternalPrices, LedgerState } from "@atlas/domain";
import {
  type EffectiveClose,
  externalPricesOf,
  type MismatchedCloses,
  parseSymbols,
  readCloseFile,
  readCloses,
  type SymbolsFile,
  type UnreadableCloses,
} from "@atlas/domain/quotes";
import { loadWebHistory, type WebHistory } from "../ecb/history.js";

export interface WebQuotes {
  readonly closes: ReadonlyMap<AssetId, readonly EffectiveClose[]>;
  /** Where they came from; absent when there are none. */
  readonly origin?: "folder" | "imported";
  /** When the import was made. */
  readonly importedAt?: string;
  /** Files that do not read: their assets have no automatic price, and it is said. */
  readonly unreadable: readonly UnreadableCloses[];
  /**
   * Closes stored in a currency their source does not declare in
   * `prices/symbols.json` (feature 013 stored pence as pounds): left out, and
   * said. Only known where the folder gives the correspondence.
   */
  readonly mismatched: readonly MismatchedCloses[];
  /**
   * Why the currency of the closes could not be checked (second pass of the
   * review of PR #80), said and never silent: no `symbols.json` beside them
   * (the closes are used as they are), or one that does not read (none used).
   */
  readonly symbols?: SymbolsProblem;
  /** The folder is linked and lost its permission, or this browser keeps nothing. */
  readonly problem?: "permission" | "storage";
  readonly history: WebHistory;
}

export type SymbolsProblem =
  | { readonly problem: "missing" }
  | { readonly problem: "unreadable"; readonly code: string };

/** The correspondence of a text of `symbols.json`, or why there is none. */
const symbolsOf = (text: string | undefined): SymbolsFile | SymbolsProblem => {
  if (text === undefined) {
    return { problem: "missing" };
  }
  try {
    return parseSymbols(text);
  } catch (error) {
    return { problem: "unreadable", code: (error as { code: string }).code };
  }
};

/**
 * The closes of `files` read with the correspondence of `text`: all of them
 * without one (said), none with one that does not read (said).
 */
const withSymbols = (
  files: ReadonlyMap<AssetId, string>,
  text: string | undefined,
): Pick<WebQuotes, "closes" | "unreadable" | "mismatched" | "symbols"> => {
  const symbols = symbolsOf(text);
  if ("problem" in symbols && symbols.problem === "unreadable") {
    return { closes: new Map(), unreadable: [], mismatched: [], symbols };
  }
  const read = readCloses(files, "problem" in symbols ? undefined : symbols);
  return {
    closes: read.closes,
    unreadable: read.unreadable,
    mismatched: read.mismatched,
    ...("problem" in symbols ? { symbols } : {}),
  };
};

const fromFolder = async (
  assetIds: readonly AssetId[],
): Promise<{ files?: Map<AssetId, string>; symbols?: string; problem?: "permission" }> => {
  const handle = await rememberedFolder();
  if (handle === undefined) {
    return {};
  }
  if ((await queryFolderPermission(handle)) !== "granted") {
    return { problem: "permission" };
  }
  const files = await readFolderPrices(handle, assetIds);
  if (files.size === 0) {
    return {};
  }
  const symbols = await readFolderText(handle, ["prices", "symbols.json"]);
  return symbols === undefined ? { files } : { files, symbols };
};

/** The closes for the assets given: the folder's, else the imported ones, else none. */
export const loadWebQuotes = async (assetIds: readonly AssetId[]): Promise<WebQuotes> => {
  const history = await loadWebHistory();
  try {
    const folder = await fromFolder(assetIds);
    const problem = folder.problem === undefined ? {} : { problem: folder.problem };
    if (folder.files !== undefined) {
      return { ...withSymbols(folder.files, folder.symbols), origin: "folder", history };
    }
    const imported = await importedPrices();
    if (imported === undefined) {
      return { closes: new Map(), unreadable: [], mismatched: [], history, ...problem };
    }
    const wanted = new Set(assetIds);
    return {
      ...withSymbols(
        new Map(Object.entries(imported.files).filter(([assetId]) => wanted.has(assetId))),
        imported.symbols,
      ),
      origin: "imported",
      importedAt: imported.imported_at,
      history,
      ...problem,
    };
  } catch {
    // Without a store to read from (private mode, blocked site data): said.
    return { closes: new Map(), unreadable: [], mismatched: [], history, problem: "storage" };
  }
};

/** The quotes of the ledger `state` at any date, for the gate; nothing without closes. */
export const externalOf = (
  quotes: WebQuotes | undefined,
  state: LedgerState,
): ExternalPrices | undefined =>
  quotes === undefined || quotes.closes.size === 0
    ? undefined
    : externalPricesOf(state, {
        closes: quotes.closes,
        ...(quotes.history.history === undefined ? {} : { history: quotes.history.history }),
        staleDays: quotes.history.staleDays,
      });

/**
 * The files of `prices/` that the console writes, that are not prices and that
 * the web does not need. `symbols.json` is not one of them: it says which
 * closes are stored in the wrong currency (second pass of the review of PR #80).
 */
const COMPANIONS = ["_status.json", "config.json"];
const SYMBOLS = "symbols.json";

export type PricesImport =
  | {
      readonly kind: "imported";
      readonly assets: readonly AssetId[];
      /** Files of `prices/` that are not prices (its correspondence, its status): left aside. */
      readonly ignored: readonly string[];
    }
  | { readonly kind: "refused"; readonly file: string; readonly code: string };

/**
 * Imports the files of `prices/` the user chose, in the format of `prices/` —
 * not a new one. Each is read **before** anything is kept, with the reader of
 * the domain: one that does not read refuses the whole import, never half.
 */
export const importPriceFiles = async (
  files: readonly { name: string; text: string }[],
  now: Date = new Date(),
): Promise<PricesImport> => {
  const incoming: Record<AssetId, string> = {};
  const ignored: string[] = [];
  let symbols: string | undefined;
  for (const { name, text } of files) {
    if (name === SYMBOLS) {
      try {
        parseSymbols(text);
      } catch (error) {
        return { kind: "refused", file: name, code: (error as { code: string }).code };
      }
      symbols = text;
      continue;
    }
    // The other files of the folder `prices/` come along when a whole folder
    // is chosen: they are not prices, and they are left aside with a note
    // instead of refusing the import (review of PR #78).
    if (COMPANIONS.includes(name)) {
      ignored.push(name);
      continue;
    }
    const assetId = assetOfPriceFile(name);
    if (assetId === undefined) {
      return { kind: "refused", file: name, code: "not_a_price_file" };
    }
    try {
      readCloseFile(assetId, text);
    } catch (error) {
      return { kind: "refused", file: name, code: (error as { code: string }).code };
    }
    incoming[assetId] = text;
  }
  const before = await importedPrices();
  const kept = symbols ?? before?.symbols;
  await saveImportedPrices({
    files: { ...(before?.files ?? {}), ...incoming },
    imported_at: now.toISOString(),
    ...(kept === undefined ? {} : { symbols: kept }),
  });
  return { kind: "imported", assets: Object.keys(incoming), ignored };
};

/** Deletes the prices imported by hand in this browser. */
export const forgetPrices = (): Promise<void> => forgetImportedPrices();
