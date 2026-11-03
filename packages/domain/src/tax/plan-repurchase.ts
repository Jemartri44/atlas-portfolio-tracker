// What a purchase of the month's plan would do to a loss whose repurchase
// window is still open (criterion #2). It only warns: the plan is not changed,
// no purchase is removed, and buying stays the user's call. A repurchase does
// not lose the loss either, it defers it until what was bought back is sold.
//
// One function for every surface that shows the plan —Cartera on the web and
// the monthly email—, so that both say the same. The figures are the
// repurchase calendar's, which are the tax engine's own lines.

import type { CivilDate } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import type { Money } from "../money/money.js";
import type { ContributionRow } from "../projections/contribution.js";
import type { AssetId, LedgerEvent } from "../schema/events.js";
import { repurchaseCalendar } from "./repurchase-calendar.js";

export interface PlanRepurchaseWarning {
  asset_id: AssetId;
  sale_event_id: Ulid;
  sale_date: CivilDate;
  /** Last day on which a purchase still defers the loss (included). */
  until: CivilDate;
  /**
   * Loss of that sale a purchase before `until` could defer, positive. All of
   * it when the purchase covers the units sold; less when it covers fewer.
   */
  at_stake_eur: Money;
}

/**
 * The warnings of a plan on `today`: one per purchase of the plan and
 * loss-making sale of the same asset whose window is still open. A plan with
 * nothing to buy, or a ledger with no such sale, has none.
 */
export const planRepurchaseWarnings = (
  events: readonly LedgerEvent[],
  plan: { rows: readonly Pick<ContributionRow, "asset_id" | "allocation_eur">[] },
  today: CivilDate,
): PlanRepurchaseWarning[] => {
  const buying = new Set(
    plan.rows.filter((row) => row.allocation_eur.amount.isPositive()).map((row) => row.asset_id),
  );
  if (buying.size === 0) {
    return [];
  }
  return repurchaseCalendar(events, today)
    .blocks.filter((block) => buying.has(block.asset_id))
    .flatMap((block) =>
      block.sales.map((sale) => ({
        asset_id: block.asset_id,
        sale_event_id: sale.event_id,
        sale_date: sale.fiscal_date,
        until: sale.until,
        at_stake_eur: sale.at_stake_eur,
      })),
    );
};
