// The repurchase warnings of the month's plan (`planRepurchaseWarnings`),
// loaded with the fiscal engine only when Cartera has a plan to show: the tax
// chain is too heavy for the boot, and a warning that arrives a moment later
// changes nothing of the plan.

import type { LedgerEvent } from "@atlas/domain";
import type { PlanRepurchaseWarning } from "@atlas/domain/fiscal";
import { createResource, For, type JSX } from "solid-js";
import { Amount, Notice } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import type { ContributionView } from "../../view-models/core/index.js";

/** Warnings of the plan by asset: a purchase that would defer a loss (criterion #2). */
export type Repurchase = (assetId: string) => PlanRepurchaseWarning[];

interface Source {
  events: readonly LedgerEvent[];
  view: ContributionView | undefined;
  date: string;
}

/** The warnings of each asset of the plan; none while they load or if they cannot be read. */
export const usePlanRepurchase = (source: () => Source): Repurchase => {
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

/** The line beside a purchase of the plan: what it would defer, never an order. */
export const PlanRepurchaseNotes = (props: { warnings: PlanRepurchaseWarning[] }): JSX.Element => (
  <For each={props.warnings}>
    {(warning) => (
      <Notice severity="caution">
        <span data-testid="plan-repurchase">
          Esta compra aplazaría hasta <Amount value={warning.at_stake_eur} /> de pérdida de la venta
          del {formatDate(warning.sale_date)}: su ventana de recompra sigue abierta hasta el{" "}
          {formatDate(warning.until)}. La pérdida no se pierde, cuenta cuando vendas lo recomprado.
        </span>
      </Notice>
    )}
  </For>
);
