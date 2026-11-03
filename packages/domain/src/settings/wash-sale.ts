// The wash-sale window, counted date to date (ADR-0014, business-rules.md
// §5.4). Two months are not 61 days: with a monthly contribution on the same
// day of the month, a sale on the 1st of July and a repurchase on the 1st of
// September are 62 days — outside a window of days, inside the law.
//
// Only the arithmetic and the reading of the setting live here. Deferring the
// loss, splitting it across the repurchased lots and carrying it through
// transfers and swaps is the tax engine of phase 5.

import { addDays, addMonths, addYears, type CivilDate } from "../dates/civil-date.js";
import type { AssetFields, AssetType } from "../schema/events.js";
import {
  ADMITTED_FUND_WINDOW,
  DEFAULT_WASH_SALE_TRANSFER_COUNTS,
  DEFAULT_WASH_SALE_WINDOW,
  FUND_REGULATED_MARKETS,
  incomeCategoryOf,
  NOT_ADMITTED_FUND_WINDOW,
  type Settings,
  type WashSaleWindow,
} from "./settings.js";

/** What of an asset decides its window: the type, and for a fund its domicile and market. */
export type WashSaleAsset = Pick<AssetFields, "asset_type" | "isin" | "issuer_country" | "market">;

/**
 * Whether the units of a fund count as admitted to trading (art. 33.5.f): a
 * Spanish fund, which article 4.9 of RD 1082/2012 deems listed, or a class
 * whose `market` the user set to one of `FUND_REGULATED_MARKETS`. **The ISIN
 * decides the domicile**: an `IE…` fund is Irish whatever `issuer_country`
 * says, which only counts when there is no ISIN.
 */
export const fundAdmitted = (asset: WashSaleAsset): boolean =>
  (asset.isin === undefined ? asset.issuer_country === "ES" : /^ES/i.test(asset.isin)) ||
  FUND_REGULATED_MARKETS.includes(asset.market?.toUpperCase() as string);

/**
 * The window in force for an asset (criterion #2): the settings, the legacy
 * form, or the default (ADR-0018). Movable capital income has
 * its own rule, article 25.2.b) LIRPF: two months before or after, for any
 * financial asset, whatever the market and with no one-year variant, so a
 * configured window does not apply. A fund set to `"by_domicile"` takes two
 * months when its units count as admitted (`fundAdmitted`, `2:fund_admitted_2m`)
 * and a year otherwise (`2:fund_1y`, article 33.5.g), also without ISIN or country.
 */
export const washSaleWindowOf = (settings: Settings, asset: WashSaleAsset): WashSaleWindow => {
  if (incomeCategoryOf(settings, asset.asset_type) === "movable_capital") {
    return "2m";
  }
  const setting =
    (settings.wash_sale_window as Partial<Settings["wash_sale_window"]> | undefined)?.[
      asset.asset_type
    ] ??
    settings.wash_sale_window_days?.[asset.asset_type] ??
    DEFAULT_WASH_SALE_WINDOW[asset.asset_type];
  if (typeof setting === "number") {
    return `${setting}d`;
  }
  return setting === "by_domicile"
    ? fundAdmitted(asset)
      ? ADMITTED_FUND_WINDOW
      : NOT_ADMITTED_FUND_WINDOW
    : setting;
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

/**
 * Whether the rule looks at purchases before the sale. Crypto has no official
 * secondary market, so only article 33.5.e) LIRPF applies to it: the year
 * **following** the sale, nothing before. Securities, funds and ETPs keep the
 * window on both sides (article 33.5.f and g).
 */
export const washSaleLooksBack = (assetType: AssetType): boolean => assetType !== "crypto";

/**
 * First day of the window around a sale, counted the same way: the window
 * before it, or the sale day itself when the rule only looks forward.
 */
export const washSaleWindowStart = (
  fiscalDate: CivilDate,
  window: WashSaleWindow,
  assetType: AssetType,
): CivilDate => (washSaleLooksBack(assetType) ? shift(fiscalDate, window, -1) : fiscalDate);
