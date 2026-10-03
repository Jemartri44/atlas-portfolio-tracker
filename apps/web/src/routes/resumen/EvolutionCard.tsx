// The evolution of the net worth of the summary (feature 020, E4, M3): the
// main panel with the core and what was contributed (a step), and a strip for
// the bucket and another for the cash, each on its own scale.

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
    labels={["Cartera principal", "Cubo", "Efectivo", "Aportado"]}
    colours={["--c-series-core", "--c-series-bucket", "--c-series-cash", "--c-series-contrib"]}
    dashes={[undefined, undefined, undefined, [6, 4]]}
    stepped={[3]}
    panels={[{ series: [0, 3] }, { series: [1], name: "Cubo" }, { series: [2], name: "Efectivo" }]}
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
