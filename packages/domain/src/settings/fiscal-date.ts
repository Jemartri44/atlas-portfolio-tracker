// `fiscal_date` is derived per asset type from Settings.fiscal_date_rule and
// never stored (ADR-0013). It decides the tax year, the lot age, the FX rate
// date and the wash-sale window.

import type { CivilDate } from "../dates/civil-date.js";
import type { AssetType } from "../schema/events.js";
import { fiscalDateRuleOf, type Settings } from "./settings.js";

export interface BusinessDates {
  trade_date: CivilDate;
  value_date: CivilDate;
}

/**
 * The rule is read through `fiscalDateRuleOf`, which resolves the documented
 * default when the settings do not mention the asset type (ADR-0018). Reading
 * the map directly would make a missing type fall into `value_date` by
 * elimination, which is a wrong fiscal date arrived at in silence.
 */
export const fiscalDateOf = (
  dates: BusinessDates,
  assetType: AssetType,
  settings: Settings,
): CivilDate =>
  fiscalDateRuleOf(settings, assetType) === "trade_date" ? dates.trade_date : dates.value_date;
