// `fiscal_date` is derived per asset type from Settings.fiscal_date_rule and
// never stored (ADR-0013). It decides the tax year, the lot age, the FX rate
// date and the wash-sale window.

import type { CivilDate } from "../dates/civil-date.js";
import type { AssetType } from "../schema/events.js";
import type { Settings } from "./settings.js";

export interface BusinessDates {
  trade_date: CivilDate;
  value_date: CivilDate;
}

export const fiscalDateOf = (
  dates: BusinessDates,
  assetType: AssetType,
  settings: Settings,
): CivilDate =>
  settings.fiscal_date_rule[assetType] === "trade_date" ? dates.trade_date : dates.value_date;
