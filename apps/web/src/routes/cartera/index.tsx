// "¿Dónde va el dinero este mes?" — the screen the user opens at the start of
// the month, on the phone, before placing the orders by hand.
//
// **One date, one projection.** Every block reads the ledger cut at the date in
// the address bar (`asOf`, ADR-0016) and nobody touches the base snapshot: that
// is the blocking defect of feature 004 — quantities from the end of the ledger
// read with the prices of another day — made impossible by construction.
//
// A block the domain refuses (no prices, no target weights) explains itself and
// leaves the others standing (FR-013).
//
// Composition (docs/design/system.md §7.5): the weights and the contribution
// side by side from 1024px, the costs across; the date in force to the right
// of the title.

import { contributionPlan, coreWeights, costSummary, settingsAt } from "@atlas/domain";
import { createMemo, type JSX } from "solid-js";
import { AsOfPicker, useAsOf } from "../../components/index.js";
import { nameIndex } from "../../format/names.js";
import { attempt } from "../../ledger/query.js";
import { store } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { contributionView, costsView, weightsView } from "../../view-models/core/index.js";
import { absorbedAssets } from "../../view-models/weighted.js";
import { RequireLedger } from "../guard.jsx";
import { ContributionCard } from "./ContributionCard.jsx";
import { CostsCard } from "./CostsCard.jsx";
import { WeightsCard } from "./WeightsCard.jsx";

export default function CarteraRoute(): JSX.Element {
  const asOf = useAsOf();

  return (
    <RequireLedger skeleton={8}>
      {(snapshot) => {
        const names = nameIndex(snapshot.state);
        const date = (): string => asOf.date();
        const dated = () => store.projectionAt(date()) ?? snapshot.state;
        const settings = () => settingsAt(dated(), date()).settings;

        const weights = createMemo(() =>
          weightsView(coreWeights(dated(), date(), settings()), names),
        );
        const contribution = createMemo(() =>
          attempt(() =>
            contributionView(
              contributionPlan(dated(), { date: date(), settings: settings() }),
              names,
            ),
          ),
        );
        /** Funds converted into another and holding nothing: not listed, not offered. */
        const absorbed = createMemo(() => absorbedAssets(dated(), snapshot.events, date()));
        const costs = createMemo(() =>
          costsView(
            costSummary(dated(), snapshot.events, date(), settings(), date()),
            names,
            absorbed(),
          ),
        );

        const plan = () => {
          const outcome = contribution();
          return outcome.ok ? outcome.value : undefined;
        };
        const planError = () => {
          const outcome = contribution();
          return outcome.ok ? undefined : outcome.error;
        };

        return (
          <>
            <PageHeader
              title="Cartera"
              actions={
                <AsOfPicker
                  date={date()}
                  isToday={asOf.isToday()}
                  onChange={asOf.set}
                  hint="Corta todos tus datos por esa fecha: cantidades, precios y avisos."
                />
              }
            />

            <div class="grid">
              <WeightsCard
                view={weights()}
                threshold={settings().deviation_threshold_pp}
                state={dated()}
                date={date()}
                settings={settings()}
                absorbed={absorbed()}
              />
              <ContributionCard view={plan()} error={planError()} />
              <CostsCard view={costs()} />
            </div>
          </>
        );
      }}
    </RequireLedger>
  );
}
