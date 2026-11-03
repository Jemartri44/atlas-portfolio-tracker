// The download of the day (ADR-0031, «Puerto», «Política de fallo»,
// «Presupuesto»): a use case of the domain that receives the ports (ADR-0007).
//
// One source (EODHD) → last value known with its age → manual entry (the
// `valuation` of the ledger, which wins on its date). A `blocked` or a
// `rate_limited` is not retried in the same run, not even for another symbol;
// a `not_found` or an `unavailable` leaves only that asset with its last value.
// What does not fit in the budget of the day keeps its last value with its
// age, and the report says how many stayed out.
//
// Three rules the previous feature learnt the hard way:
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
import { asDomainError, DomainError } from "../errors.js";
import type { DailyClose, PriceSource, SourceFailureKind } from "../ports/price-source.js";
import type { PriceStore, PriceTransaction } from "../ports/price-store.js";
import type { QuoteSource } from "../projections/prices.js";
import type { LedgerState } from "../projections/state.js";
import type { AssetId, AssetType } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { parsePriceConfig } from "./config.js";
import { effectiveCloses, encodeCloseLine, linesToAppend, readCloseFile } from "./line.js";
import { downloadPlan, type PriorityGroup } from "./priority.js";
import { QUOTE_SOURCES } from "./sources.js";
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
  /** The ledger **of the console**, projected at `today`. */
  readonly state: LedgerState;
  readonly settings: Settings;
  /** Today in `Europe/Madrid`. */
  readonly today: CivilDate;
  readonly now: () => Date;
  readonly store: PriceStore;
  /** Only the sources that have a key: without one, a source is never called. */
  readonly sources: Partial<Record<QuoteSource, PriceSource>>;
  /**
   * Whether this run may write `symbols.json` (the console, by default) or
   * only read it (the cloud): read only, a source never
   * contrasted is left out as `currency_unchecked` — the cloud **never
   * contrasts** — and the days a local purge asked for again are
   * not chased, so `symbols.json`, whose one writer is `atlas admin prices
   * push`, is never written.
   */
  readonly symbols?: "read_write" | "read_only";
  /**
   * A console whose folder is synced with a cloud that downloads too: its
   * default budget is the leftover of the free plans.
   */
  readonly sharedWithCloud?: boolean;
}

export type AssetOutcome =
  | "updated"
  | "unchanged"
  | "up_to_date"
  | "no_symbol"
  | "out_of_budget"
  | "failed"
  | "currency_mismatch"
  | "currency_unchecked"
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
  /** Read only: the sources left out because nobody contrasted their currency. */
  readonly unchecked?: readonly QuoteSource[];
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
  /** The days a purge had asked for again, now asked once: cleared when stored. */
  readonly refetched?: Partial<Record<QuoteSource, readonly CivilDate[]>>;
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
    return asDomainError(error);
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

/**
 * Clears the days a purge asked for again once they were asked — only those it
 * asked, read again under the lock: a purge made meanwhile is left owed. A day
 * asked that has no close in force now is left as a **hole** (`unserved_days`)
 * and said by `prices status`, never chased again (a source that does not have
 * a day today will not have it tomorrow).
 */
const clearRefetched = async (
  tx: PriceTransaction,
  assetId: AssetId,
  asked: Partial<Record<QuoteSource, readonly CivilDate[]>>,
  inForce: ReadonlySet<CivilDate>,
): Promise<void> => {
  const file = parseSymbols(await tx.symbols());
  const current = file.assets[assetId];
  if (current === undefined) {
    return;
  }
  const owed: Partial<Record<QuoteSource, CivilDate[]>> = {};
  const unserved: Partial<Record<QuoteSource, CivilDate[]>> = {};
  for (const source of QUOTE_SOURCES) {
    const days = current.refetch_days?.[source] ?? [];
    const left = days.filter((date) => !(asked[source] ?? []).includes(date));
    if (left.length > 0) {
      owed[source] = left;
    }
    const holes = [
      ...new Set([
        ...(current.unserved_days?.[source] ?? []),
        ...days.filter((date) => (asked[source] ?? []).includes(date) && !inForce.has(date)),
      ]),
    ].sort();
    if (holes.length > 0) {
      unserved[source] = holes;
    }
  }
  const { refetch_days: _asked, unserved_days: _holes, ...rest } = current;
  await tx.writeSymbols(
    serializeSymbols({
      ...file,
      assets: {
        ...file.assets,
        [assetId]: {
          ...rest,
          ...(Object.keys(owed).length === 0 ? {} : { refetch_days: owed }),
          ...(Object.keys(unserved).length === 0 ? {} : { unserved_days: unserved }),
        },
      },
    }),
  );
};

/** Downloads the closes of the day; see the header for the rules. */
export const updatePrices = async (input: UpdatePricesInput): Promise<UpdateReport> => {
  const { store, today } = input;
  const readOnly = input.symbols === "read_only";
  const config = parsePriceConfig(await store.config(), {
    sharedWithCloud: input.sharedWithCloud === true,
  });
  const symbols = parseSymbols(await store.symbols());
  const source = QUOTE_SOURCES.find(
    (name) => input.sources[name] !== undefined && config.daily_calls[name] > 0,
  );
  if (source === undefined) {
    return { no_sources: true, assets: [], remaining: {}, failing: [] };
  }
  const port = input.sources[source] as PriceSource;
  port.ready?.();

  const outcomes: CallOutcome[] = [];
  const downloads: Download[] = [];
  const failuresOf = new Map<AssetId, AssetFailure | undefined>();
  const reports: AssetReport[] = [];
  /** The failure that took the source out of this run, if any. */
  let retired: SourceFailureKind | undefined;

  const reserve = (): Promise<boolean> =>
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

  /** Contrasts the declared currency with the metadata of the source, and records it. */
  const contrast = async (
    assetId: AssetId,
    entry: SymbolEntry,
  ): Promise<{ entry: SymbolEntry; kind?: QuoteFailureKind }> => {
    if (!(await reserve())) {
      return { entry, kind: "budget_exhausted" };
    }
    const result = await port
      .currencyOf(entry[source] as string)
      .catch(() => ({ ok: false, kind: "unavailable" }) as const);
    const at = input.now().toISOString();
    if (!result.ok) {
      outcomes.push({ source, at, ok: false, kind: result.kind });
      failuresOf.set(assetId, { kind: result.kind, source, at });
      if (RETIRES_SOURCE.includes(result.kind)) {
        retired = result.kind;
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
    if (declared?.[source] === undefined) {
      reports.push({ asset_id, group, outcome: "no_symbol", added: 0, failures: [] });
      continue;
    }
    let entry: SymbolEntry = declared;
    const failures: { source: QuoteSource; kind: QuoteFailureKind }[] = [];
    const report = (outcome: AssetOutcome, extra: Partial<AssetReport> = {}): void => {
      reports.push({ asset_id, group, outcome, added: 0, failures, ...extra });
    };
    const fail = (kind: QuoteFailureKind): void => {
      failures.push({ source, kind });
      report(outcomeOf(failures));
    };
    const agrees = currencyAgrees(entry, source);
    if (!agrees) {
      failures.push({ source, kind: "currency_mismatch" });
      failuresOf.set(asset_id, {
        kind: "currency_mismatch",
        source,
        at: input.now().toISOString(),
        declared: entry.currencies[source] as string,
        found: entry.currency_check?.[source]?.found as string,
      });
    }
    const last = lastDateOf(await store.closes(asset_id), asset_id);
    if (last instanceof DomainError) {
      report("unreadable", { error: last.code });
      continue;
    }
    if (!agrees) {
      report("currency_mismatch");
      continue;
    }
    // Read only, a source never contrasted is left out: the cloud never contrasts.
    if (readOnly && entry.currency_check?.[source] === undefined) {
      report("currency_unchecked", { unchecked: [source] });
      continue;
    }
    // The days a purge promised to ask for again: the download starts at the
    // first of them, not after the last close. Read only, they are the
    // console's to chase.
    const refetch = readOnly ? undefined : entry.refetch_days;
    const owed = Object.values(refetch ?? {})
      .flat()
      .sort()[0];
    // Every planned asset is in the catalogue (`downloadPlan`), so it has a type.
    const type = (input.state.assets.get(asset_id) as { asset_type: AssetType }).asset_type;
    if (
      owed === undefined &&
      last !== undefined &&
      last >= lastMarketDayBefore(today, config.market_days[type])
    ) {
      report("up_to_date");
      continue;
    }
    // The N calendar days ending on the last close stored are asked again
    // when its type says so (crypto, live test of 2026-09-27: a provisional
    // close equal to the day before): the same call starts earlier, and a
    // different value is a correction.
    const after =
      last === undefined
        ? addYears(today, -1)
        : addDays(last, 1 - config.refetch_recent_days[type]);
    const from = owed !== undefined && owed < after ? owed : after;
    // **Never the value of the day in course**: asked in
    // the afternoon, a source gives a price of mid-session, and stored as the
    // close of today it would stay one for good. Only days before today.
    const to = addDays(today, -1);
    if (retired !== undefined) {
      fail(retired);
      continue;
    }
    // A correspondence declared without contrasting it with the source (no
    // key or no budget then) is contrasted **before its first download**: a
    // price is never downloaded for a currency nobody checked (the case GBX
    // against GBP).
    if (entry.currency_check?.[source] === undefined) {
      const checked = await contrast(asset_id, entry);
      entry = checked.entry;
      if (checked.kind !== undefined) {
        fail(checked.kind);
        continue;
      }
    }
    if (!(await reserve())) {
      fail("budget_exhausted");
      continue;
    }
    const result = await port
      .dailyCloses(entry[source] as string, from, to)
      .catch(() => ({ ok: false, kind: "unavailable" }) as const);
    const at = input.now().toISOString();
    if (!result.ok) {
      outcomes.push({ source, at, ok: false, kind: result.kind });
      failuresOf.set(asset_id, { kind: result.kind, source, at });
      if (RETIRES_SOURCE.includes(result.kind)) {
        retired = result.kind;
      }
      fail(result.kind);
      continue;
    }
    outcomes.push({ source, at, ok: true });
    const found = result.value.find(
      (close) => close.currency !== undefined && close.currency !== entry.currencies[source],
    );
    if (found !== undefined) {
      // The source said the currency and it is not the declared one: never
      // stored, never assumed, recorded with its own literal.
      failuresOf.set(asset_id, {
        kind: "currency_mismatch",
        source,
        at,
        declared: entry.currencies[source] as string,
        found: found.currency as string,
      });
      fail("currency_mismatch");
      continue;
    }
    downloads.push({
      asset_id,
      ...(refetch === undefined ? {} : { refetched: refetch }),
      source,
      // The currency **of the source that brought it**, never of another.
      currency: entry.currencies[source] as string,
      closes: result.value.filter((close) => close.date >= from && close.date <= to),
    });
    failuresOf.set(asset_id, undefined);
    report("updated", { source });
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
        added.set(download.asset_id, asDomainError(error).code);
        continue;
      }
      const lines = linesToAppend(
        existing,
        download.closes.map((close) => ({ ...close, currency: download.currency })),
        download.source,
        fetchedAt,
      );
      if (lines.length > 0) {
        await tx.appendCloses(download.asset_id, lines.map(encodeCloseLine));
      }
      added.set(download.asset_id, lines.length);
      if (download.refetched !== undefined) {
        await clearRefetched(
          tx,
          download.asset_id,
          download.refetched,
          new Set(effectiveCloses([...existing, ...lines]).map((close) => close.date)),
        );
      }
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
  remaining[source] = Math.max(0, config.daily_calls[source] - spentAt(status, source, now));
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
