// What the views of the console read of the automatic prices (feature 013,
// block 4): the closes of `prices/` next to the ledger, converted by the gate
// with the ECB history of the same folder. Only views of presentation call
// this; the fiscal commands never do, and their output is compared byte for
// byte with and without `prices/` (the test of the fiscal output).
//
// Everything here degrades: without `prices/` there is no external source and
// every view works as before; a file of prices that does not read leaves its
// asset without an automatic price, **and is said**; a damaged ECB history
// leaves every quote not in euros without a value in euros, and is said too.

import { homedir } from "node:os";
import { dirname } from "node:path";
import {
  AlphaVantagePriceSource,
  EodhdPriceSource,
  FileEcbHistoryStore,
  FilePriceStore,
  type Keys,
  readLocalConfig,
  readSecrets,
  SecretsError,
  secretsPath,
} from "@atlas/adapters";
import { type AssetId, DomainError, type ExternalPrices, type LedgerState } from "@atlas/domain";
import { type EcbHistory, readEcbHistory } from "@atlas/domain/ecb";
import {
  externalPricesOf,
  type PriceSource,
  type QuoteSource,
  readCloses,
  type UnreadableCloses,
} from "@atlas/domain/quotes";
import type { Context } from "../context.js";
import { describeError } from "../output/messages.js";

/** What the tests replace: the sources (never the network) and where the keys are. */
export interface PriceEnvironment {
  readonly sources?: (keys: Keys) => Partial<Record<QuoteSource, PriceSource>>;
  readonly secretsPath?: string;
}

export const folderOf = (ctx: Context): string => dirname(ctx.ledgerPath);

/** The real sources, one per key. */
export const sourcesFor = (ctx: Context, keys: Keys): Partial<Record<QuoteSource, PriceSource>> => {
  if (ctx.prices?.sources !== undefined) {
    return ctx.prices.sources(keys);
  }
  return {
    ...(keys.eodhd === undefined ? {} : { eodhd: new EodhdPriceSource(keys.eodhd) }),
    ...(keys.alpha_vantage === undefined
      ? {}
      : { alpha_vantage: new AlphaVantagePriceSource(keys.alpha_vantage) }),
  };
};

/**
 * The keys, and what to say about them. A file readable by others is not used
 * — no source is called — and the console says the `chmod` that fixes it;
 * everything else goes on (questions.md §2.4, accepted). Any other problem of
 * the file, or the two folders one inside the other, is an error: thrown.
 */
export const keysFor = async (ctx: Context): Promise<{ keys: Keys; note?: string }> => {
  const path = ctx.prices?.secretsPath ?? secretsPath(process.env, homedir());
  try {
    return { keys: await readSecrets(path, folderOf(ctx)) };
  } catch (error) {
    if (error instanceof SecretsError && error.code === "secrets_too_open") {
      return {
        keys: {},
        note: `No se usan las claves de ${path}: otros usuarios de la máquina pueden leer ese fichero. Déjalo solo para ti con «chmod 600 ${path}» y vuelve a intentarlo. Todo lo demás funciona igual; la entrada manual sigue ahí.`,
      };
    }
    throw error;
  }
};

export interface LoadedQuotes {
  readonly external?: ExternalPrices;
  readonly notes: readonly string[];
}

const historyOf = async (folder: string): Promise<{ history?: EcbHistory; note?: string }> => {
  try {
    const active = await new FileEcbHistoryStore(folder).active();
    return active === undefined ? {} : { history: readEcbHistory(active.text, active.meta.source) };
  } catch {
    return {
      note: "El histórico del BCE junto al libro no se ha podido leer: las cotizaciones que no están en euros se enseñan en su divisa y sin valor en euros.",
    };
  }
};

/** Says the problems of the automatic prices before a view, on the error channel (never in `--json`'s output). */
export const sayNotes = (ctx: Context, notes: readonly string[]): void => {
  for (const note of notes) {
    ctx.io.err(note);
  }
};

/** The automatic prices of every asset of the catalogue, ready for the gate. */
export const loadQuotes = async (ctx: Context, state: LedgerState): Promise<LoadedQuotes> => {
  const folder = folderOf(ctx);
  const store = new FilePriceStore(folder);
  const files = new Map<AssetId, string>();
  for (const assetId of state.assets.keys()) {
    const text = await store.closes(assetId);
    if (text !== undefined) {
      files.set(assetId, text);
    }
  }
  if (files.size === 0) {
    return { notes: [] };
  }
  const read = readCloses(files);
  const [{ history, note }, config] = await Promise.all([
    historyOf(folder),
    readLocalConfig(folder),
  ]);
  const notes = read.unreadable.map(
    (problem: UnreadableCloses) =>
      `Aviso: ${describeError(new DomainError(problem.code, problem.code, { asset_id: problem.asset_id, line: problem.line, field: "línea" }))}`,
  );
  return {
    external: externalPricesOf(state, {
      closes: read.closes,
      ...(history === undefined ? {} : { history }),
      staleDays: config.ecb_stale_currency_days,
    }),
    notes: note === undefined ? notes : [...notes, note],
  };
};
