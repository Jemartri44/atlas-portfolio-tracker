// What a change of settings does to the tax years already gone (prompt 005
// §3.5 bis).
//
// The settings reinterpret the past: changing `fiscal_date_rule` moves a sale
// agreed on the 30th of December and settled on the 2nd of January from one
// year to the next — which is exactly the change ADR-0013 promises will be "a
// `settings_changed`, not a deployment". The facts do not change; their reading
// does, and a return that has already been filed may stop matching the ledger.
//
// The warning does not block: it is information, like the one about a threshold
// that silences a live alert. And it is emitted for **any** previous year,
// because the ledger does not yet know which ones were filed (the
// `tax_return_filed` event is planned for round 9).

import { type CivilDate, yearOf } from "../dates/civil-date.js";
import { Money } from "../money/money.js";
import type { AssetId, LedgerEvent } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { projectLedger } from "./project-ledger.js";
import type { LedgerState, Warning } from "./state.js";
import { coreWeights } from "./weights.js";

const EUR = "EUR";

export interface SilencedWarnings {
  /** Warnings live under the settings in force that the new ones would switch off. */
  silenced: Warning[];
  /** False when it could not be evaluated (missing prices); `silenced` is then empty. */
  evaluated: boolean;
  /** Assets without a price that prevented the evaluation. */
  missing_prices: AssetId[];
}

/** Codes a threshold of `Settings` can silence. Anything else depends on facts, not on parameters. */
const THRESHOLD_CODES = ["deviation_above_threshold", "satellite_below_minimum"];

/**
 * A warning identified by **what it is about** (its code and its subject), not
 * by every detail it carries. Comparing the whole `details` would call a
 * warning "silenced" just because the threshold printed inside it changed,
 * which is a false alarm: raising the threshold from 5 to 6 pp while a 10 pp
 * deviation keeps warning silences nothing. (The CLI compared the whole
 * `details` and did report that; moving the rule here fixes it.)
 */
const SUBJECT_FIELDS = ["asset_id", "asset_class"] as const;

const keyOf = (warning: Warning): string =>
  [warning.code, ...SUBJECT_FIELDS.map((field) => String(warning.details[field] ?? ""))].join("|");

const thresholdWarnings = (
  state: LedgerState,
  date: CivilDate,
  settings: Settings,
): { warnings: Warning[]; partial: boolean; missing_prices: AssetId[] } => {
  const weights = coreWeights(state, date, settings);
  return {
    warnings: weights.warnings.filter((warning) => THRESHOLD_CODES.includes(warning.code)),
    partial: weights.partial,
    missing_prices: weights.missing_prices,
  };
};

export interface FiscalYearImpact {
  year: number;
  before: Money;
  after: Money;
}

/** Realized gains per tax year, rounded to cents once per operation (ADR-0005). */
const gainsByYear = (events: readonly LedgerEvent[], settings: Settings): Map<number, Money> => {
  const totals = new Map<number, Money>();
  for (const gain of projectLedger(events, { settings, collectErrors: true }).gains) {
    const year = yearOf(gain.fiscal_date);
    totals.set(year, (totals.get(year) ?? Money.zero(EUR)).add(gain.gain_eur_rounded));
  }
  return totals;
};

/**
 * Years **before** `currentYear` whose realized gains change when the same
 * ledger is read with the new settings, with both figures.
 */
export const movedFiscalYears = (
  events: readonly LedgerEvent[],
  current: Settings,
  next: Settings,
  currentYear: number,
): FiscalYearImpact[] => {
  const before = gainsByYear(events, current);
  const after = gainsByYear(events, next);
  const impacts: FiscalYearImpact[] = [];
  for (const year of new Set([...before.keys(), ...after.keys()])) {
    if (year >= currentYear) {
      continue;
    }
    const was = before.get(year) ?? Money.zero(EUR);
    const is = after.get(year) ?? Money.zero(EUR);
    if (!was.eq(is)) {
      impacts.push({ year, before: was, after: is });
    }
  }
  return impacts.sort((a, b) => a.year - b.year);
};

/**
 * Warnings the settings in force raise today and the new ones would silence
 * (constitution IV: raising a threshold must never mute a live alert behind the
 * user's back). It lived in the CLI; it is here so the web cannot forget to
 * warn (decision (h) of prompt 006).
 *
 * Only the threshold warnings of the core are compared, which are the ones a
 * settings change can switch off: the rest depend on facts, not on parameters.
 * When a price is missing the comparison is not possible, and that is said
 * (`evaluated: false`) instead of reporting "nothing is silenced".
 */
export const silencedWarnings = (
  state: LedgerState,
  date: CivilDate,
  current: Settings,
  next: Settings,
): SilencedWarnings => {
  const before = thresholdWarnings(state, date, current);
  if (before.partial) {
    return { silenced: [], evaluated: false, missing_prices: before.missing_prices };
  }
  const after = thresholdWarnings(state, date, next);
  const kept = new Set(after.warnings.map(keyOf));
  return {
    silenced: before.warnings.filter((warning) => !kept.has(keyOf(warning))),
    evaluated: true,
    missing_prices: [],
  };
};
