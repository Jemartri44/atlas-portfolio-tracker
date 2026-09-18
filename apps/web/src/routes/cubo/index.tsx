// "¿Qué tal va el cubo?" — the speculative bucket, measured against the index
// and against its own budget.
//
// **Nothing of the core appears here** (constitution III), with the one
// exception the budget card carries and labels: the weight of the bucket over
// total net worth (rule 18), which is a budget control and is always shown with
// the breakdown beside it.
//
// The stop-loss warning goes at the very top, as `atlas bucket` does: it is the
// rule the plan wants hardest to ignore. It warns; it never blocks.

import {
  bucketIndexSeries,
  bucketPositions,
  bucketStats,
  bucketTheses,
  netWorth,
  settingsAt,
} from "@atlas/domain";
import { createMemo, For, type JSX, Show } from "solid-js";
import { SeriesCard } from "../../components/chart/index.js";
import { AsOfPicker, Callout, useAsOf } from "../../components/index.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { nameIndex } from "../../format/names.js";
import { store } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import {
  bucketPositionsView,
  bucketReportView,
  thesesView,
} from "../../view-models/bucket/index.js";
import { netWorthView } from "../../view-models/index.js";
import { bucketIndexPlot } from "../../view-models/series.js";
import { RequireLedger } from "../guard.jsx";
import { BudgetCard } from "./BudgetCard.jsx";
import { PositionsCard } from "./PositionsCard.jsx";
import { StatsCard } from "./StatsCard.jsx";
import { ThesesCard } from "./ThesesCard.jsx";

const MAX_POINTS = 120;

export default function CuboRoute(): JSX.Element {
  const asOf = useAsOf();

  return (
    <RequireLedger skeleton={8}>
      {(snapshot) => {
        const names = nameIndex(snapshot.state);
        const date = (): string => asOf.date();
        const dated = () => store.projectionAt(date()) ?? snapshot.state;
        const settings = () => settingsAt(dated(), date()).settings;

        const positions = createMemo(() =>
          bucketPositionsView(bucketPositions(dated(), date(), settings()), names),
        );
        const theses = createMemo(() =>
          thesesView(bucketTheses(dated(), date(), settings()), names),
        );
        const report = createMemo(() =>
          bucketReportView(
            bucketStats(dated(), snapshot.events, date(), settings(), date()),
            names,
          ),
        );
        const worth = createMemo(() => netWorthView(netWorth(dated(), date(), settings()), names));
        const series = createMemo(() =>
          bucketIndexPlot(
            bucketIndexSeries(snapshot.events, { to: date(), max_points: MAX_POINTS }),
          ),
        );

        /** Rule 17 breached: top of the screen, not a corner. */
        const stopLoss = () =>
          report().controls.warnings.filter(
            (warning) => warning.code === "bucket_stop_loss_reached",
          );
        const others = () =>
          [
            ...positions().warnings,
            ...theses().warnings,
            ...report().stats.warnings,
            ...report().controls.warnings,
          ].filter((warning) => warning.code !== "bucket_stop_loss_reached");

        return (
          <>
            <PageHeader
              title="Cubo"
              lead="Posiciones abiertas, tesis frente al índice, estadísticas y presupuesto."
            />
            <AsOfPicker
              date={date()}
              isToday={asOf.isToday()}
              onChange={asOf.set}
              hint="Corta el libro entero por esa fecha: cantidades, precios, tesis y avisos."
            />

            <div class="stack">
              <For each={stopLoss()}>
                {(warning) => (
                  <Callout tone="error" title="Regla de parada">
                    {describeWarning(warning, names)}
                  </Callout>
                )}
              </For>

              <PositionsCard view={positions()} />
              <ThesesCard view={theses()} />
              <SeriesCard
                title="El cubo frente al índice"
                labels={["Resultado del cubo", "Equivalente en el índice"]}
                colours={["--c-series-bucket", "--c-series-index"]}
                dashes={[undefined, [6, 4]]}
                x={series().x}
                values={series().values}
                rows={series().rows}
                missing={series().missing}
                empty={
                  <Callout tone="info" title="Todavía no hay nada que dibujar">
                    La comparación se dibuja sobre las fechas en las que el libro tiene precio del
                    índice y de los activos del cubo.
                  </Callout>
                }
              />
              <StatsCard view={report().stats} />
              <BudgetCard view={report().controls} worth={worth()} />

              <Show when={others().length > 0}>
                <section class="card" aria-label="Avisos del cubo">
                  <header>
                    <h2>Avisos</h2>
                    <span class="tiny">{others().length}</span>
                  </header>
                  <div class="stack">
                    <For each={others()}>
                      {(warning) => <p class="note flush">{describeWarning(warning, names)}</p>}
                    </For>
                  </div>
                </section>
              </Show>
            </div>
          </>
        );
      }}
    </RequireLedger>
  );
}
