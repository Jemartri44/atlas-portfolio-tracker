// The evolution of the net worth of the summary (direction A, docs/design/system.md §5.15): the
// main panel with the core **and the cash of its accounts** as an area, the bucket with the cash of
// its own stacked on it — so the top edge is the whole net worth — and what was contributed to the
// core as a dashed step, read against the core's edge and never against the stack. A strip keeps
// the bucket on its own scale: stacked on a core forty times its size, its shape would not show. Net worth is the core, the bucket and the cash of the
// investment accounts (ADR-0004): each cash goes with its book, so nothing is
// counted twice, no third panel repeats it, and the breakdown stays in the
// block of the net worth above.

import { type JSX, Show } from "solid-js";
import { SeriesCard } from "../../components/chart/index.js";
import { Notice } from "../../components/index.js";
import type { PlottedSeries } from "../../view-models/series.js";

export const EvolutionCard = (props: {
  asOf: string;
  series: PlottedSeries;
  /** The core bought before its first recorded deposit: said, not made up. */
  uncoveredBuys: boolean;
}): JSX.Element => (
  <SeriesCard
    title="Evolución del patrimonio"
    asOf={props.asOf}
    class="span-8 summary-evolution"
    labels={[
      "Cartera principal con su efectivo",
      "Cubo con su efectivo",
      "Aportado a la cartera principal",
    ]}
    colours={["--c-series-core", "--c-series-bucket", "--c-series-contrib"]}
    dashes={[undefined, undefined, [6, 4]]}
    stepped={[2]}
    filled={[0, 1]}
    stacked={{ top: 1, on: 0 }}
    panels={[{ series: [0, 3, 2] }, { series: [1], name: "Cubo" }]}
    foot={
      <Show when={props.uncoveredBuys}>
        <p class="card-note">
          Lo aportado solo cuenta los ingresos registrados, y hay compras anteriores al primero.
        </p>
      </Show>
    }
    x={props.series.x}
    values={props.series.values}
    rows={props.series.rows}
    missing={props.series.missing}
    empty={
      <Notice severity="info" title="Todavía no hay nada que dibujar">
        La evolución se dibuja sobre las fechas que tienen precio. Registra una valoración y
        aparecerá el primer punto.
      </Notice>
    }
  />
);
