// Where the web gets the daily closes: the price files of our own cloud (`GET /api/reference/prices`),
// read with the session, held in memory for the life of the page and converted with the ECB history
// the web holds. Nothing is kept on the device; the ledger never depends on them (they are
// informational).
//
// Loaded lazily: nothing of it is on the boot path, and the build fails if it
// ever is.

import { httpReference } from "@atlas/adapters/reference-http";
import { type AssetId, DomainError, type ExternalPrices, type LedgerState } from "@atlas/domain";
import {
  type EffectiveClose,
  ecbRatesOnly,
  externalPricesOf,
  type MismatchedCloses,
  parseSymbols,
  priceFileName,
  readCloses,
  type SymbolsFile,
  type UnreadableCloses,
} from "@atlas/domain/quotes";
import { loadWebHistory, type WebHistory } from "../ecb/history.js";

export interface WebQuotes {
  readonly closes: ReadonlyMap<AssetId, readonly EffectiveClose[]>;
  /** Where they came from; absent when there are none. */
  readonly origin?: "cloud";
  /** Files that do not read: their assets have no automatic price, and it is said. */
  readonly unreadable: readonly UnreadableCloses[];
  /**
   * Closes stored in a currency their source does not declare in
   * `prices/symbols.json`: left out, and
   * said. Only known where `symbols.json` was imported with the closes.
   */
  readonly mismatched: readonly MismatchedCloses[];
  /**
   * Why the currency of the closes could not be checked, said and never silent: no `symbols.json`
   * beside them (the closes are used as they are), or one that does not read (none used).
   */
  readonly symbols?: SymbolsProblem;
  /** What the screens say of `symbols`, here and not in a module of its own (the boot). */
  readonly symbolsNotice?: string;
  /** The cloud did not answer, so no automatic price could be read. */
  readonly problem?: "unavailable";
  readonly history: WebHistory;
}

type SymbolsProblem =
  | { readonly problem: "missing" }
  | { readonly problem: "unreadable"; readonly code: string };

/** Why the currency of the automatic prices could not be checked. */
const symbolsNotice = (symbols: SymbolsProblem): string =>
  symbols.problem === "missing"
    ? "Sin prices/symbols.json junto a ellos no se puede comprobar la divisa de los precios automáticos: se usan tal como están."
    : symbols.code === "symbols_file_newer_version"
      ? "prices/symbols.json es de una versión más nueva de la aplicación: no se usan precios automáticos. Recarga la aplicación para actualizarla."
      : "prices/symbols.json no se entiende: no se puede comprobar la divisa de los precios automáticos, y no se usan. Vuelve a declarar los símbolos desde la consola.";

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
): Pick<WebQuotes, "closes" | "unreadable" | "mismatched" | "symbols" | "symbolsNotice"> => {
  const symbols = symbolsOf(text);
  if ("problem" in symbols && symbols.problem === "unreadable") {
    return {
      closes: new Map(),
      unreadable: [],
      mismatched: [],
      symbols,
      symbolsNotice: symbolsNotice(symbols),
    };
  }
  const read = readCloses(files, "problem" in symbols ? undefined : symbols);
  return {
    closes: read.closes,
    unreadable: read.unreadable,
    mismatched: read.mismatched,
    ...("problem" in symbols ? { symbols, symbolsNotice: symbolsNotice(symbols) } : {}),
  };
};

/** The text of each price file already read in this page, by file name (`undefined`: not there). */
const held = new Map<string, Promise<string | undefined>>();

const SYMBOLS = "symbols.json";

/** Forgets what was read: a new reading, or the end of the session (they say which assets are followed). */
export const forgetPrices = (): void => {
  held.clear();
};

const decoder = new TextDecoder("utf-8", { fatal: true });

/** One file of `prices/` from the API, once per page; a failed read is not held. */
const fileOf = (
  reference: ReturnType<typeof httpReference>,
  name: string,
): Promise<string | undefined> => {
  let reading = held.get(name);
  if (reading === undefined) {
    reading = reference.get("prices", name).then((read) => {
      if (read.kind !== "file") {
        return undefined;
      }
      return decoder.decode(read.bytes);
    });
    held.set(name, reading);
    reading.catch(() => held.delete(name));
  }
  return reading;
};

/**
 * The closes for the assets given, read from the cloud with the session and held in memory. A file
 * the cloud has not is an asset with no automatic price; the cloud not answering is said
 * (`problem`), and the rest of the screen goes on with the manual valuations.
 */
export const loadWebQuotes = async (
  assetIds: readonly AssetId[],
  request: typeof fetch = (...args) => fetch(...args),
): Promise<WebQuotes> => {
  const history = await loadWebHistory(request);
  const reference = httpReference({ origin: "", fetch: request });
  let files: ReadonlyMap<AssetId, string>;
  let symbols: string | undefined;
  try {
    const read = await Promise.all([
      fileOf(reference, SYMBOLS),
      ...assetIds.map(
        async (assetId) => [assetId, await fileOf(reference, priceFileName(assetId))] as const,
      ),
    ]);
    [symbols] = read as [string | undefined, ...unknown[]];
    files = new Map(
      (read.slice(1) as (readonly [AssetId, string | undefined])[]).flatMap(([assetId, text]) =>
        text === undefined ? [] : [[assetId, text] as const],
      ),
    );
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        closes: new Map(),
        unreadable: [],
        mismatched: [],
        history,
        problem: "unavailable",
      };
    }
    throw error;
  }
  if (files.size === 0) {
    return { closes: new Map(), unreadable: [], mismatched: [], history };
  }
  return { ...withSymbols(files, symbols), origin: "cloud", history };
};

/** The quotes of `state` for the gate; without closes, the ECB rates of the cash. */
export const externalOf = (
  quotes: WebQuotes | undefined,
  state: LedgerState,
): ExternalPrices | undefined => {
  const history = quotes?.history.history;
  if (quotes === undefined || quotes.closes.size === 0) {
    return history === undefined ? undefined : ecbRatesOnly(history);
  }
  return externalPricesOf(state, {
    closes: quotes.closes,
    ...(history === undefined ? {} : { history }),
    staleDays: quotes.history.staleDays,
  });
};
