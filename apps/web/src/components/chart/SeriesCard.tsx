// A time series with everything it owes the reader: the range buttons, the
// chart, the legend (colour **and** dash), the sentence about what is missing
// and the equivalent table.
//
// It is one component and not three copies because both charts of feature 007
// need exactly this, and the next one will too.

import { createMemo, createSignal, type JSX, Show } from "solid-js";
import { Section } from "../Section.jsx";
import { Chart, type ChartSeries } from "./Chart.jsx";
import { ChartLegend } from "./ChartLegend.jsx";
import { ChartTable } from "./ChartTable.jsx";
import { RangeButtons, type RangeOption } from "./RangeButtons.jsx";
import { type RangeKey, rangeCounts, rangeIndices } from "./ranges.js";

export interface SeriesCardProps {
  title: string;
  /** Its place in the grid of the screen. */
  class?: string | undefined;
  /** Names of the series, in the order of `values`. */
  labels: readonly string[];
  colours: readonly string[];
  dashes: readonly (readonly number[] | undefined)[];
  x: readonly number[];
  values: readonly (number | null)[][];
  rows: readonly { date: string; values: readonly (string | undefined)[] }[];
  missing?: string | undefined;
  /** What the card says when there is nothing at all to draw. */
  empty: JSX.Element;
  /** Above the chart: the figure the chart explains, when it has one. */
  lead?: JSX.Element | undefined;
  /** Under the chart and before its table: what goes with it, a strip of figures. */
  foot?: JSX.Element | undefined;
  /** The last rows of the card, drawn or not: a disclosure with the detail. */
  tail?: JSX.Element | undefined;
}

export const SeriesCard = (props: SeriesCardProps): JSX.Element => {
  const [range, setRange] = createSignal<RangeKey>("TODO");

  const indices = createMemo<number[]>(() => rangeIndices(props.x, range()));
  const options = createMemo<RangeOption[]>(() => rangeCounts(props.x, props.values));

  const series = (): ChartSeries[] =>
    props.labels.map((label, index) => ({
      label,
      values: indices().map((at) => props.values[index]?.[at] ?? null),
      colour: props.colours[index] ?? "--c-series-index",
      ...(props.dashes[index] === undefined ? {} : { dash: props.dashes[index] as number[] }),
    }));

  const shown = (): number[] => indices().map((at) => props.x[at] as number);

  return (
    <Section
      title={props.title}
      class={`is-chart ${props.class ?? ""}`.trimEnd()}
      aside={<RangeButtons options={options()} current={range()} onChange={setRange} />}
    >
      {props.lead}
      <Show when={props.x.length > 0} fallback={props.empty}>
        <figure class="chart">
          <Chart x={shown()} series={series()} label={props.title} />
          <figcaption>
            <ChartLegend series={series()} />
          </figcaption>
        </figure>
        {props.foot}
        <ChartTable
          headers={props.labels}
          rows={indices().map((at) => ({
            date: props.rows[at]?.date ?? "",
            values: props.rows[at]?.values ?? [],
          }))}
          caption={props.title}
          missing={props.missing}
        />
      </Show>
      {props.tail}
    </Section>
  );
};
