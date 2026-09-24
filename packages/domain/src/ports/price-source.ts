import type { CivilDate } from "../dates/civil-date.js";
import type { DecimalString } from "../money/decimal.js";
import type { QuoteSource } from "../projections/prices.js";

/**
 * The six failures of a source, each with its own literal (ADR-0031, «Puerto»).
 * None is folded into another: the cascade treats them differently and the
 * status of a source records which one it was.
 */
export type SourceFailureKind =
  | "unavailable"
  | "not_found"
  | "rate_limited"
  | "blocked"
  | "invalid_response"
  | "budget_exhausted";

export const SOURCE_FAILURE_KINDS: readonly SourceFailureKind[] = [
  "unavailable",
  "not_found",
  "rate_limited",
  "blocked",
  "invalid_response",
  "budget_exhausted",
];

/**
 * One daily close as the source gave it: the close **as traded** (never an
 * adjusted one), as the decimal text it arrived with (ADR-0005; a number is
 * never read through a float), and the currency **only if the source says
 * it** — neither EODHD nor Alpha Vantage do (questions.md §1.1, §1.4), and
 * then the currency declared in `prices/symbols.json` applies.
 */
export interface DailyClose {
  readonly date: CivilDate;
  readonly close: DecimalString;
  readonly currency?: string;
}

export type SourceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly kind: SourceFailureKind };

/**
 * A source of daily closes (ADR-0031): one adapter per source, asynchronous,
 * the only thing with a network. **Outside** everything the web bundles.
 *
 * No failure carries a message of the source or an address: the key of two of
 * the sources travels in the URL, and what is never kept cannot leak (§6.4 (e)
 * of prompt 013).
 */
export interface PriceSource {
  readonly name: QuoteSource;
  /** The daily closes of `symbol` from `from` to `to`, both included. */
  dailyCloses(symbol: string, from: CivilDate, to: CivilDate): Promise<SourceResult<DailyClose[]>>;
  /**
   * The currency the source's own metadata gives for `symbol`, used only when
   * the user declares a correspondence (decision D-Q2); `undefined` when the
   * metadata do not say. Costs a call of the quota.
   */
  currencyOf(symbol: string): Promise<SourceResult<string | undefined>>;
}
