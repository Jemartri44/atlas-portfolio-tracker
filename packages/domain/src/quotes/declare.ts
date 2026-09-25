// Declaring the symbols of an asset (decisions D-Q2 and D-Q6 of the
// direction): the user says the symbol in each source and the currency of the
// quote; the application **asks each source's metadata** for the currency —
// one call of the budget each, reserved under the lock like any other — and
// writes nothing until every disagreement has been confirmed explicitly.
//
// Two steps on purpose, so that confirming a disagreement never spends the
// calls twice: `checkSymbols` asks (network, outside the lock), and
// `recordSymbols` writes (under the lock, reading the file again).

import { ValidationError } from "../errors.js";
import type { PriceSource, SourceFailureKind } from "../ports/price-source.js";
import type { PriceStore } from "../ports/price-store.js";
import type { QuoteSource } from "../projections/prices.js";
import type { AssetId } from "../schema/events.js";
import { parsePriceConfig } from "./config.js";
import { encodeCloseLine, mismatchedLines, readCloseFile } from "./line.js";
import { QUOTE_SOURCES } from "./sources.js";
import { parseStatus, reserveCall, serializeStatus } from "./status.js";
import {
  type CurrencyDisagreement,
  declareSymbols,
  parseSymbols,
  type SymbolDeclaration,
  type SymbolEntry,
  serializeSymbols,
} from "./symbols.js";

export type SymbolCheck =
  | {
      readonly ok: true;
      /** What each source's metadata said (`undefined`: they do not say). */
      readonly checks: Partial<Record<QuoteSource, string | undefined>>;
      /** Sources with a symbol but without a key or a budget: not confirmed, and said. */
      readonly unchecked: readonly QuoteSource[];
    }
  | { readonly ok: false; readonly source: QuoteSource; readonly kind: SourceFailureKind };

/** Asks every source with a symbol in the declaration for its currency. */
export const checkSymbols = async (input: {
  readonly declaration: SymbolDeclaration;
  readonly store: PriceStore;
  readonly sources: Partial<Record<QuoteSource, PriceSource>>;
  readonly now: () => Date;
}): Promise<SymbolCheck> => {
  const config = parsePriceConfig(await input.store.config());
  const checks: Partial<Record<QuoteSource, string | undefined>> = {};
  const unchecked: QuoteSource[] = [];
  for (const source of QUOTE_SOURCES) {
    if (input.declaration[source] !== undefined) {
      input.sources[source]?.ready?.();
    }
  }
  for (const source of QUOTE_SOURCES) {
    const symbol = input.declaration[source];
    if (symbol === undefined) {
      continue;
    }
    const port = input.sources[source];
    const reserved =
      port !== undefined &&
      (await input.store.transact(async (tx) => {
        const next = reserveCall(
          parseStatus(await tx.status()),
          source,
          config.daily_calls[source],
          input.now(),
        );
        if (next !== undefined) {
          await tx.writeStatus(serializeStatus(next));
        }
        return next !== undefined;
      }));
    if (!reserved) {
      unchecked.push(source);
      continue;
    }
    const result = await (port as PriceSource)
      .currencyOf(symbol)
      .catch(() => ({ ok: false, kind: "unavailable" }) as const);
    if (!result.ok) {
      return { ok: false, source, kind: result.kind };
    }
    checks[source] = result.value;
  }
  return { ok: true, checks, unchecked };
};

/**
 * Writes the declaration of `assetId`, confirmed over the sources listed in
 * `accepted`. Returns the disagreements still to confirm, and writes nothing
 * while there is any.
 */
export const recordSymbols = (input: {
  readonly assetId: AssetId;
  readonly declaration: SymbolDeclaration;
  readonly checks: Partial<Record<QuoteSource, string | undefined>>;
  readonly accepted: readonly QuoteSource[];
  readonly store: PriceStore;
  readonly now: () => Date;
}): Promise<readonly CurrencyDisagreement[]> => {
  const { entry, pending } = declareSymbols(
    input.declaration,
    input.checks,
    input.now().toISOString(),
    input.accepted,
  );
  if (pending.length > 0) {
    return Promise.resolve(pending);
  }
  return input.store.transact(async (tx) => {
    const file = parseSymbols(await tx.symbols());
    const before = file.assets[input.assetId];
    await tx.writeSymbols(
      serializeSymbols({
        ...file,
        assets: { ...file.assets, [input.assetId]: { ...entry, ...carried(before, entry) } },
      }),
    );
    return [];
  });
};

/**
 * What a new declaration keeps of the one before, for the sources it still
 * declares: the closes 013 stored wrong are still wrong (`misstored`), and the
 * days a purge promised to ask for again are still owed (`refetch_from`).
 */
const carried = (
  before: SymbolEntry | undefined,
  entry: SymbolEntry,
): Pick<SymbolEntry, "misstored" | "refetch_from"> => {
  const keep = <T>(
    record: Partial<Record<QuoteSource, T>> | undefined,
  ): Partial<Record<QuoteSource, T>> | undefined => {
    const kept = Object.fromEntries(
      Object.entries(record ?? {}).filter(([source]) => entry[source as QuoteSource] !== undefined),
    ) as Partial<Record<QuoteSource, T>>;
    return Object.keys(kept).length === 0 ? undefined : kept;
  };
  const misstored = keep(before?.misstored);
  const refetch = keep(before?.refetch_from);
  return {
    ...(misstored === undefined ? {} : { misstored }),
    ...(refetch === undefined ? {} : { refetch_from: refetch }),
  };
};

/** Removes the correspondence of `assetId`; `false` when it had none. */
export const removeSymbols = (store: PriceStore, assetId: AssetId): Promise<boolean> =>
  store.transact(async (tx) => {
    const file = parseSymbols(await tx.symbols());
    if (file.assets[assetId] === undefined) {
      return false;
    }
    const assets = { ...file.assets };
    delete assets[assetId];
    await tx.writeSymbols(serializeSymbols({ ...file, assets }));
    return true;
  });

/**
 * Purges the closes of `assetId` from `source` whose currency is not the one
 * that source declares now (review of PR #80): feature 013 stored the pence of
 * Alpha Vantage as pounds. Only on an explicit request of the user, under the
 * lock, and only those lines. **The next download asks for their days again**
 * (second pass of the review): the first purged day is written down for that
 * source (`refetch_from`), because the last close of the asset — of another
 * source, maybe of a later day — would otherwise leave them out for good.
 * Returns how many were removed.
 */
export const purgeMismatched = (
  store: PriceStore,
  assetId: AssetId,
  source: QuoteSource,
): Promise<number> =>
  store.transact(async (tx) => {
    const file = parseSymbols(await tx.symbols());
    const entry = file.assets[assetId];
    if (entry?.currencies[source] === undefined) {
      throw new ValidationError(
        "symbols_not_declared",
        `${assetId} has no symbol declared for ${source}: there is nothing to compare its closes with`,
        { asset_id: assetId, source },
      );
    }
    const lines = readCloseFile(assetId, (await tx.closes(assetId)) ?? "");
    const wrong = mismatchedLines(
      lines.filter((line) => line.source === source),
      entry,
    );
    if (wrong.length > 0) {
      await tx.rewriteCloses(
        assetId,
        lines.filter((line) => !wrong.includes(line)).map(encodeCloseLine),
      );
    }
    const first = wrong.map((line) => line.date).sort()[0];
    const owed = entry.refetch_from?.[source];
    const { [source]: _purged, ...misstored } = entry.misstored ?? {};
    const { misstored: _before, ...rest } = entry;
    if (first === undefined && entry.misstored?.[source] === undefined) {
      return 0;
    }
    await tx.writeSymbols(
      serializeSymbols({
        ...file,
        assets: {
          ...file.assets,
          [assetId]: {
            ...rest,
            // Nothing stored wrong of that source is left.
            ...(Object.keys(misstored).length === 0 ? {} : { misstored }),
            ...(first === undefined
              ? {}
              : {
                  refetch_from: {
                    ...entry.refetch_from,
                    [source]: owed !== undefined && owed < first ? owed : first,
                  },
                }),
          },
        },
      }),
    );
    return wrong.length;
  });
