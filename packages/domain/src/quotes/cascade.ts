// The download of the day (ADR-0031, «Puerto», «Política de fallo»,
// «Presupuesto»): a use case of the domain that receives the ports (ADR-0007).
//
// Primary → fallback → last value known with its age → manual entry. The order
// of the sources comes from `prices/config.json`, never from the code. A
// `blocked` or a `rate_limited` is not retried in the same run, not even for
// another symbol; a `not_found` or an `unavailable` of the primary does go to
// the fallback. What does not fit in the budget of the day keeps its last value
// with its age, and the report says how many stayed out.
//
// Three rules the previous feature learnt the hard way (§2 ter of prompt 013):
//
// - **No network call with the lock held.** Every call is reserved in the
//   status **under** the lock of the folder, and made **after** releasing it.
// - **Checking and writing go together.** Whether a close is already there is
//   decided inside the lock, reading the file again, never with what was read
//   before downloading; and the outcomes are applied to the status read again
//   inside the lock, so that another console is not overwritten.
// - **Never more calls than configured**, even with two consoles at once: a
//   reservation that is never used is lost in favour of the provider, never
//   against it.

import { addDays, addYears, type CivilDate } from "../dates/civil-date.js";
import { DomainError } from "../errors.js";
import type { DailyClose, PriceSource, SourceFailureKind } from "../ports/price-source.js";
import type { PriceStore } from "../ports/price-store.js";
import type { QuoteSource } from "../projections/prices.js";
import type { LedgerState } from "../projections/state.js";
import type { AssetId } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { parsePriceConfig } from "./config.js";
import { effectiveCloses, encodeCloseLine, linesToAppend, readCloseFile } from "./line.js";
import { downloadPlan, type PriorityGroup } from "./priority.js";
import {
  type AssetFailure,
  applyOutcomes,
  type CallOutcome,
  failingSources,
  lastMarketDayBefore,
  parseStatus,
  type QuoteFailureKind,
  reserveCall,
  serializeStatus,
  spentAt,
  withAssetFailures,
} from "./status.js";
import { currencyAgrees, parseSymbols, type SymbolEntry, serializeSymbols } from "./symbols.js";

export interface UpdatePricesInput {
  /** The ledger **of the console**, projected at `today` (P5). */
  readonly state: LedgerState;
  readonly settings: Settings;
  /** Today in `Europe/Madrid`. */
  readonly today: CivilDate;
  readonly now: () => Date;
  readonly store: PriceStore;
  /** Only the sources that have a key: without one, a source is never called. */
  readonly sources: Partial<Record<QuoteSource, PriceSource>>;
}

export type AssetOutcome =
  | "updated"
  | "unchanged"
  | "up_to_date"
  | "no_symbol"
  | "out_of_budget"
  | "failed"
  | "currency_mismatch"
  | "unreadable";

export interface AssetReport {
  readonly asset_id: AssetId;
  readonly group: PriorityGroup;
  readonly outcome: AssetOutcome;
  /** The source that answered. */
  readonly source?: QuoteSource;
  /** Lines appended to its file. */
  readonly added: number;
  /** Every source that failed for it, with its kind, in order. */
  readonly failures: readonly { readonly source: QuoteSource; readonly kind: QuoteFailureKind }[];
  /** The code of the error that kept its file from being read (`unreadable`). */
  readonly error?: string;
}

export interface UpdateReport {
  /** No source has a key and a budget: nothing was called, and it is not an error. */
  readonly no_sources: boolean;
  readonly assets: readonly AssetReport[];
  /** Calls left today, per source used. */
  readonly remaining: Readonly<Partial<Record<QuoteSource, number>>>;
  /** Sources at or over the threshold of consecutive failures. */
  readonly failing: readonly QuoteSource[];
}

interface Download {
  readonly asset_id: AssetId;
  readonly source: QuoteSource;
  readonly currency: string;
  readonly closes: readonly DailyClose[];
}

const RETIRES_SOURCE: readonly SourceFailureKind[] = ["blocked", "rate_limited"];

/** The last date in force of an asset, or why its file does not read. */
const lastDateOf = (
  text: string | undefined,
  assetId: AssetId,
): CivilDate | undefined | DomainError => {
  try {
    return effectiveCloses(readCloseFile(assetId, text ?? "")).at(-1)?.date;
  } catch (error) {
    return error as DomainError;
  }
};

/**
 * Why nothing was downloaded for an asset: a currency that disagrees when that
 * is all there was; out of budget when the budget is all that stopped it
 * besides that; a failure otherwise.
 */
const outcomeOf = (failures: readonly { kind: QuoteFailureKind }[]): AssetOutcome => {
  const kinds = new Set(failures.map((failure) => failure.kind));
  kinds.delete("currency_mismatch");
  if (kinds.size === 0) {
    return "currency_mismatch";
  }
  return kinds.size === 1 && kinds.has("budget_exhausted") ? "out_of_budget" : "failed";
};

/** Downloads the closes of the day; see the header for the rules. */
export const updatePrices = async (input: UpdatePricesInput): Promise<UpdateReport> => {
  const { store, today } = input;
  const config = parsePriceConfig(await store.config());
  const symbols = parseSymbols(await store.symbols());
  const available = config.source_order.filter(
    (source) => input.sources[source] !== undefined && config.daily_calls[source] > 0,
  );
  if (available.length === 0) {
    return { no_sources: true, assets: [], remaining: {}, failing: [] };
  }
  for (const source of available) {
    input.sources[source]?.ready?.();
  }

  const outcomes: CallOutcome[] = [];
  const downloads: Download[] = [];
  const failuresOf = new Map<AssetId, AssetFailure | undefined>();
  const reports: AssetReport[] = [];
  /** Sources out of this run, with the failure that retired them. */
  const retired = new Map<QuoteSource, SourceFailureKind>();

  const reserve = (source: QuoteSource): Promise<boolean> =>
    store.transact(async (tx) => {
      const next = reserveCall(
        parseStatus(await tx.status()),
        source,
        config.daily_calls[source],
        input.now(),
      );
      if (next === undefined) {
        return false;
      }
      await tx.writeStatus(serializeStatus(next));
      return true;
    });

  /** Contrasts the declared currency with the metadata of `source`, and records it. */
  const contrast = async (
    assetId: AssetId,
    entry: SymbolEntry,
    source: QuoteSource,
  ): Promise<{ entry: SymbolEntry; kind?: QuoteFailureKind }> => {
    if (!(await reserve(source))) {
      return { entry, kind: "budget_exhausted" };
    }
    const result = await (input.sources[source] as PriceSource)
      .currencyOf(entry[source] as string)
      .catch(() => ({ ok: false, kind: "unavailable" }) as const);
    const at = input.now().toISOString();
    if (!result.ok) {
      outcomes.push({ source, at, ok: false, kind: result.kind });
      failuresOf.set(assetId, { kind: result.kind, source, at });
      if (RETIRES_SOURCE.includes(result.kind)) {
        retired.set(source, result.kind);
      }
      return { entry, kind: result.kind };
    }
    outcomes.push({ source, at, ok: true });
    const check = result.value === undefined ? { at } : { found: result.value, at };
    const checked: SymbolEntry = {
      ...entry,
      currency_check: { ...entry.currency_check, [source]: check },
    };
    await store.transact(async (tx) => {
      const file = parseSymbols(await tx.symbols());
      const current = file.assets[assetId];
      // Only onto the declaration it was made for: one changed meanwhile is left as it is.
      if (
        current !== undefined &&
        current[source] === entry[source] &&
        current.currencies[source] === entry.currencies[source]
      ) {
        await tx.writeSymbols(
          serializeSymbols({
            ...file,
            assets: {
              ...file.assets,
              [assetId]: {
                ...current,
                currency_check: { ...current.currency_check, [source]: check },
              },
            },
          }),
        );
      }
    });
    if (currencyAgrees(checked, source)) {
      return { entry: checked };
    }
    failuresOf.set(assetId, {
      kind: "currency_mismatch",
      source,
      at,
      declared: entry.currencies[source] as string,
      found: result.value as string,
    });
    return { entry: checked, kind: "currency_mismatch" };
  };

  for (const { asset_id, group } of downloadPlan(input.state, input.settings)) {
    const declared: SymbolEntry | undefined = symbols.assets[asset_id];
    const candidates = available.filter((source) => declared?.[source] !== undefined);
    if (declared === undefined || candidates.length === 0) {
      reports.push({ asset_id, group, outcome: "no_symbol", added: 0, failures: [] });
      continue;
    }
    let entry: SymbolEntry = declared;
    const failures: { source: QuoteSource; kind: QuoteFailureKind }[] = [];
    const usable = candidates.filter((source) => {
      if (currencyAgrees(entry, source)) {
        return true;
      }
      failures.push({ source, kind: "currency_mismatch" });
      failuresOf.set(asset_id, {
        kind: "currency_mismatch",
        source,
        at: input.now().toISOString(),
        declared: entry.currencies[source] as string,
        found: entry.currency_check?.[source]?.found as string,
      });
      return false;
    });
    const last = lastDateOf(await store.closes(asset_id), asset_id);
    if (last instanceof DomainError) {
      reports.push({
        asset_id,
        group,
        outcome: "unreadable",
        added: 0,
        failures,
        error: last.code,
      });
      continue;
    }
    if (usable.length === 0) {
      reports.push({ asset_id, group, outcome: "currency_mismatch", added: 0, failures });
      continue;
    }
    if (last !== undefined && last >= lastMarketDayBefore(today)) {
      reports.push({ asset_id, group, outcome: "up_to_date", added: 0, failures });
      continue;
    }
    const from = last === undefined ? addYears(today, -1) : addDays(last, 1);
    // **Never the value of the day in course** (review of PR #78): asked in
    // the afternoon, a source gives a price of mid-session, and stored as the
    // close of today it would stay one for good. Only days before today.
    const to = addDays(today, -1);
    let answered: QuoteSource | undefined;
    for (const source of usable) {
      const retiredBy = retired.get(source);
      if (retiredBy !== undefined) {
        failures.push({ source, kind: retiredBy });
        continue;
      }
      // A correspondence declared without contrasting it with this source (no
      // key or no budget then) is contrasted **before its first download**:
      // a price is never downloaded for a currency nobody checked (review of
      // PR #78; the case GBX against GBP that decision D-Q2 is there for).
      if (entry.currency_check?.[source] === undefined) {
        const checked = await contrast(asset_id, entry, source);
        entry = checked.entry;
        if (checked.kind !== undefined) {
          failures.push({ source, kind: checked.kind });
          continue;
        }
      }
      if (!(await reserve(source))) {
        failures.push({ source, kind: "budget_exhausted" });
        continue;
      }
      const symbol = entry[source] as string;
      const result = await (input.sources[source] as PriceSource)
        .dailyCloses(symbol, from, to)
        .catch(() => ({ ok: false, kind: "unavailable" }) as const);
      const at = input.now().toISOString();
      if (!result.ok) {
        outcomes.push({ source, at, ok: false, kind: result.kind });
        failures.push({ source, kind: result.kind });
        failuresOf.set(asset_id, { kind: result.kind, source, at });
        if (RETIRES_SOURCE.includes(result.kind)) {
          retired.set(source, result.kind);
        }
        continue;
      }
      outcomes.push({ source, at, ok: true });
      const found = result.value.find(
        (close) => close.currency !== undefined && close.currency !== entry.currencies[source],
      );
      if (found !== undefined) {
        // The source said the currency and it is not the declared one: never
        // stored, never assumed, recorded with its own literal (§6.3 (a)).
        failures.push({ source, kind: "currency_mismatch" });
        failuresOf.set(asset_id, {
          kind: "currency_mismatch",
          source,
          at,
          declared: entry.currencies[source] as string,
          found: found.currency as string,
        });
        continue;
      }
      downloads.push({
        asset_id,
        source,
        // The currency **of the source that brought it**, never of another.
        currency: entry.currencies[source] as string,
        closes: result.value.filter((close) => close.date >= from && close.date <= to),
      });
      failuresOf.set(asset_id, undefined);
      answered = source;
      break;
    }
    if (answered === undefined) {
      reports.push({ asset_id, group, outcome: outcomeOf(failures), added: 0, failures });
    } else {
      reports.push({ asset_id, group, outcome: "updated", source: answered, added: 0, failures });
    }
  }

  const added = new Map<AssetId, number | string>();
  const status = await store.transact(async (tx) => {
    const fetchedAt = input.now().toISOString();
    for (const download of downloads) {
      let existing: ReturnType<typeof readCloseFile>;
      try {
        existing = readCloseFile(download.asset_id, (await tx.closes(download.asset_id)) ?? "");
      } catch (error) {
        // Another writer left a line this code does not read between the
        // reading above and this one: nothing is appended to that file.
        added.set(download.asset_id, (error as DomainError).code);
        continue;
      }
      const lines = linesToAppend(
        existing,
        download.closes.map((close) => ({ ...close, currency: download.currency })),
        download.source,
        config.source_order,
        fetchedAt,
      );
      if (lines.length > 0) {
        await tx.appendCloses(download.asset_id, lines.map(encodeCloseLine));
      }
      added.set(download.asset_id, lines.length);
    }
    const next = withAssetFailures(
      applyOutcomes(parseStatus(await tx.status()), outcomes),
      failuresOf,
    );
    await tx.writeStatus(serializeStatus(next));
    return next;
  });

  const now = input.now();
  const remaining: Partial<Record<QuoteSource, number>> = {};
  for (const source of available) {
    remaining[source] = Math.max(0, config.daily_calls[source] - spentAt(status, source, now));
  }
  return {
    no_sources: false,
    assets: reports.map((report) => {
      const count = added.get(report.asset_id);
      if (report.outcome !== "updated" || count === undefined) {
        return report;
      }
      return typeof count === "string"
        ? { ...report, outcome: "unreadable" as const, error: count }
        : {
            ...report,
            outcome: count === 0 ? ("unchanged" as const) : ("updated" as const),
            added: count,
          };
    }),
    remaining,
    failing: failingSources(status, config.failure_threshold),
  };
};
