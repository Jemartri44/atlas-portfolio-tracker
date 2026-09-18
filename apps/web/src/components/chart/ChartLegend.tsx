// The legend of a chart. Colour **and** dash pattern **and** the name, because
// the colour is never the only carrier of meaning (decision (f) of the 006):
// the same chart has to read in a black-and-white screenshot and to somebody
// who does not distinguish blue from orange.

import { For, type JSX } from "solid-js";
import type { ChartSeries } from "./Chart.jsx";

/** The dash of the legend swatch, drawn with a repeating gradient, not an image. */
const swatchStyle = (series: ChartSeries): string =>
  series.dash === undefined ? "solid" : "dashed";

export const ChartLegend = (props: { series: readonly ChartSeries[] }): JSX.Element => (
  <ul class="chart-legend">
    <For each={props.series}>
      {(series) => (
        <li class={`entry is-${swatchStyle(series)}`}>
          <span class={`swatch is-${series.colour.replace("--c-series-", "")}`} />
          {series.label}
        </li>
      )}
    </For>
  </ul>
);
