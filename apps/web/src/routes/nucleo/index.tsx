// "¿Dónde va el dinero este mes?" — the screen the user opens at the start of
// the month, on the phone, before placing the orders by hand.
//
// **One date, one projection.** Every block reads the ledger cut at the date in
// the address bar (`asOf`, ADR-0016) and nobody touches the base snapshot: that
// is the blocking defect of feature 004 — quantities from the end of the ledger
// read with the prices of another day — made impossible by construction.
//
// A block the domain refuses (no prices, no target weights) explains itself and
// leaves the other four standing (FR-013).

import {
  contributionPlan,
  coreWeights,
  costSummary,
  netWorthSeries,
  settingsAt,
} from "@atlas/domain";
import { createMemo, type JSX, Show } from "solid-js";
import { SeriesCard } from "../../components/chart/index.js";
import { AsOfPicker, Callout, useAsOf } from "../../components/index.js";
import { nameIndex } from "../../format/names.js";
import { attempt } from "../../ledger/query.js";
import { store } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { contributionView, costsView, weightsView } from "../../view-models/core/index.js";
import { netWorthPlot } from "../../view-models/series.js";
import { RequireLedger } from "../guard.jsx";
import { ContributionCard } from "./ContributionCard.jsx";
import { CostsCard } from "./CostsCard.jsx";
import { TransferCard } from "./TransferCard.jsx";
import { WeightsCard } from "./WeightsCard.jsx";

/** Enough points for a curve, few enough that twenty years stay instant. */
const MAX_POINTS = 120;

export default function NucleoRoute(): JSX.Element {
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
        const costs = createMemo(() =>
          costsView(costSummary(dated(), snapshot.events, date(), settings(), date()), names),
        );
        const series = createMemo(() =>
          netWorthPlot(
            netWorthSeries(snapshot.events, { to: date(), max_points: MAX_POINTS }),
            names,
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
              title="Núcleo"
              lead="Pesos frente al objetivo, reparto de la aportación, simulador de traspaso y costes."
            />
            <AsOfPicker
              date={date()}
              isToday={asOf.isToday()}
              onChange={asOf.set}
              hint="Corta el libro entero por esa fecha: cantidades, precios y avisos."
            />

            <div class="stack">
              <WeightsCard view={weights()} />
              <ContributionCard view={plan()} error={planError()} />
              <TransferCard state={dated()} date={date()} settings={settings()} />
              <CostsCard view={costs()} />
              <SeriesCard
                title="Evolución del patrimonio"
                labels={["Núcleo", "Cubo", "Efectivo"]}
                colours={["--c-series-core", "--c-series-bucket", "--c-series-cash"]}
                dashes={[undefined, [6, 4], [2, 3]]}
                x={series().x}
                values={series().values}
                rows={series().rows}
                missing={series().missing}
                empty={
                  <Callout tone="info" title="Todavía no hay nada que dibujar">
                    La evolución se dibuja sobre las fechas en las que el libro tiene precios.
                    Registra una valoración y aparecerá el primer punto.
                  </Callout>
                }
              />
              <Show when={weights().stale.length > 0}>
                <Callout tone="warning" title="Hay precios caducados">
                  {weights().stale.join(", ")}: el precio que se está usando es más antiguo de lo
                  que dice la configuración. Sigue siendo el último que conoce el libro, con su
                  antigüedad a la vista.
                </Callout>
              </Show>
            </div>
          </>
        );
      }}
    </RequireLedger>
  );
}
