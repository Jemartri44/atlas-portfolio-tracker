// The evolution of the net worth of the summary (feature 020, E4, M3): the
// main panel with the core **and the cash of its accounts** against what was
// contributed (a step), and a strip for the bucket with the cash of its own,
// on its own scale. Net worth is the core, the bucket and the cash of the
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
    class="span-12 summary-evolution"
    labels={["Cartera principal con su efectivo", "Cubo con su efectivo", "Aportado"]}
    colours={["--c-series-core", "--c-series-bucket", "--c-series-contrib"]}
    dashes={[undefined, undefined, [6, 4]]}
    stepped={[2]}
    panels={[{ series: [0, 2] }, { series: [1], name: "Cubo" }]}
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
