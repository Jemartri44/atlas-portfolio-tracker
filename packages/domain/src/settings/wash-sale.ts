// The wash-sale window, counted date to date (ADR-0014, business-rules.md
// §5.4). Two months are not 61 days: with a monthly contribution on the same
// day of the month, a sale on the 1st of July and a repurchase on the 1st of
// September are 62 days — outside a window of days, inside the law.
//
// Only the arithmetic and the reading of the setting live here. Deferring the
// loss, splitting it across the repurchased lots and carrying it through
// transfers and swaps is the tax engine of phase 5.

import { addDays, addMonths, addYears, type CivilDate } from "../dates/civil-date.js";
import type { AssetType } from "../schema/events.js";
import {
  DEFAULT_WASH_SALE_TRANSFER_COUNTS,
  DEFAULT_WASH_SALE_WINDOW,
  type Settings,
  type WashSaleWindow,
} from "./settings.js";

/** The window in force for an asset type: the settings, the legacy form, or the default (ADR-0018). */
export const washSaleWindowOf = (settings: Settings, assetType: AssetType): WashSaleWindow => {
  const configured = settings.wash_sale_window[assetType];
  if (configured !== undefined) {
    return configured;
  }
  const legacyDays = settings.wash_sale_window_days?.[assetType];
  return legacyDays === undefined ? DEFAULT_WASH_SALE_WINDOW[assetType] : `${legacyDays}d`;
};

/**
 * Whether a `transfer` in counts as an acquisition for the rule
 * (business-rules.md §5.4, fiscal question #2b). Resolved here instead of
 * reading the field, so that its absence means the documented default (`true`,
 * the prudent reading) and never `false` by elimination, which would be the
 * wrong criterion arrived at in silence.
 */
export const washSaleTransferCounts = (settings: Settings): boolean =>
  settings.wash_sale_transfer_counts ?? DEFAULT_WASH_SALE_TRANSFER_COUNTS;

/** Moves a date by the window, forwards or backwards. */
const shift = (date: CivilDate, window: WashSaleWindow, direction: 1 | -1): CivilDate => {
  if (window === "2m") {
    return addMonths(date, 2 * direction);
  }
  if (window === "1y") {
    return addYears(date, direction);
  }
  return addDays(date, Number(window.slice(0, -1)) * direction);
};

/**
 * Last day of the window after a sale: a purchase **on** this date still
 * triggers the rule, the next day does not. The day the target month does not
 * have falls on its last one (31-01 plus one month is 28-02), the default
 * recorded in `docs/fiscal-questions.md` #14.
 */
export const washSaleWindowEnd = (fiscalDate: CivilDate, window: WashSaleWindow): CivilDate =>
  shift(fiscalDate, window, 1);

/** First day of the window before a sale, counted the same way. */
export const washSaleWindowStart = (fiscalDate: CivilDate, window: WashSaleWindow): CivilDate =>
  shift(fiscalDate, window, -1);
