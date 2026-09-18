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

import { yearOf } from "../dates/civil-date.js";
import { Money } from "../money/money.js";
import type { LedgerEvent } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { projectLedger } from "./project-ledger.js";

const EUR = "EUR";

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
