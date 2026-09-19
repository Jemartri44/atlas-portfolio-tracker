// The legend of a chart. Colour **and** dash pattern **and** the name, because
// the colour is never the only carrier of meaning (decision (f) of the 006):
// the same chart has to read in a black-and-white screenshot and to somebody
// who does not distinguish blue from orange. Each key is a short piece of the
// line itself, drawn with the same dash as the series.

import { For, type JSX } from "solid-js";
import type { ChartSeries } from "./Chart.jsx";

/** The class of a series, from its colour token: `--c-series-core` → `is-core`. */
export const keyClass = (colour: string): string => `is-${colour.replace("--c-series-", "")}`;

/** A short piece of the line: its colour from the token, its dash from the series. */
export const LineKey = (props: { colour: string; dash?: readonly number[] | undefined }) => (
  <svg class={`key ${keyClass(props.colour)}`} viewBox="0 0 20 12" aria-hidden="true">
    <line x1="2" y1="6" x2="18" y2="6" stroke-dasharray={props.dash?.join(" ")} />
  </svg>
);

export const ChartLegend = (props: { series: readonly ChartSeries[] }): JSX.Element => (
  <ul class="chart-legend">
    <For each={props.series}>
      {(series) => (
        <li class={series.dash === undefined ? "entry is-solid" : "entry is-dashed"}>
          <LineKey colour={series.colour} dash={series.dash} />
          {series.label}
        </li>
      )}
    </For>
  </ul>
);
