// The repurchase warnings of the month's plan (`planRepurchaseWarnings`),
// loaded with the fiscal engine only when Cartera has a plan to show: the tax
// chain is too heavy for the boot, and a warning that arrives a moment later
// changes nothing of the plan.

import type { LedgerEvent } from "@atlas/domain";
import type { PlanRepurchaseWarning } from "@atlas/domain/fiscal";
import { createResource } from "solid-js";
import type { ContributionView } from "../../view-models/core/index.js";

interface Source {
  events: readonly LedgerEvent[];
  view: ContributionView | undefined;
  date: string;
}

/** The warnings of each asset of the plan; none while they load or if they cannot be read. */
export const usePlanRepurchase = (
  source: () => Source,
): ((assetId: string) => PlanRepurchaseWarning[]) => {
  const [warnings] = createResource(
    () => {
      const { events, view, date } = source();
      return view === undefined ? false : { events, view, date };
    },
    async ({ events, view, date }) => {
      const { planRepurchaseWarnings } = await import("@atlas/domain/fiscal");
      const rows = view.rows.map((row) => ({
        asset_id: row.assetId,
        allocation_eur: row.allocation,
      }));
      return planRepurchaseWarnings(events, { rows }, date);
    },
  );
  return (assetId) => {
    // A ledger the tax engine refuses must not take the plan down with it.
    if (warnings.error !== undefined) {
      return [];
    }
    return (warnings() ?? []).filter((entry) => entry.asset_id === assetId);
  };
};
