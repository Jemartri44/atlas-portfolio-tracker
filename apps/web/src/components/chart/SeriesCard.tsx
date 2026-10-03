// A time series with everything it owes the reader: the range buttons, the
// chart, the legend (colour **and** dash), the sentence about what is missing
// and the equivalent table.
//
// It is one component and not three copies because both charts of feature 007
// need exactly this, and the next one will too.

import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { formatDate } from "../../format/date.js";
import { gapRule, type MissingNote } from "../../view-models/series.js";
import { Section } from "../Section.jsx";
import { Chart, type ChartSeries } from "./Chart.jsx";
import { ChartLegend } from "./ChartLegend.jsx";
import { ChartTable } from "./ChartTable.jsx";
import { gapsOf } from "./gaps.js";
import { RangeButtons, type RangeOption } from "./RangeButtons.jsx";
import { type RangeKey, rangeCounts, rangeIndices } from "./ranges.js";

export interface SeriesCardProps {
  title: string;
  /** The date asked about: «Este año» runs from 1 January of its year to it. */
  asOf: string;
  /** Its place in the grid of the screen. */
  class?: string | undefined;
  /** Names of the series, in the order of `values`. */
  labels: readonly string[];
  colours: readonly string[];
  dashes: readonly (readonly number[] | undefined)[];
  x: readonly number[];
  values: readonly (number | null)[][];
  rows: readonly { date: string; values: readonly (string | undefined)[] }[];
  missing?: MissingNote | undefined;
  /** What the card says when there is nothing at all to draw. */
  empty: JSX.Element;
  /** Above the chart: the figure the chart explains, when it has one. */
  lead?: JSX.Element | undefined;
  /** Under the chart and before its table: what goes with it, a strip of figures. */
  foot?: JSX.Element | undefined;
  /** The last rows of the card, drawn or not: a disclosure with the detail. */
  tail?: JSX.Element | undefined;
  /**
   * The series that are drawn as steps, by index (what was contributed), and
   * the panels of a stack: each with the series it draws and, for a strip, its
   * name. Each panel has its own scale and they share the dates and the cursor
   * (feature 020, E4, M3). Without panels, one chart with everything.
   */
  stepped?: readonly number[] | undefined;
  panels?: readonly { series: readonly number[]; name?: string }[] | undefined;
  /** What the values are: euros, or a percentage (axis and table without a mask). */
  unit?: "eur" | "pct" | undefined;
  /** Past half a range of holes, jump to the last stretch with data and say so (M7). */
  jump?: boolean | undefined;
}

export const SeriesCard = (props: SeriesCardProps): JSX.Element => {
  const [range, setRange] = createSignal<RangeKey>("TODO");

  const ranged = createMemo<number[]>(() => rangeIndices(props.x, range(), props.asOf));
  const hole = createMemo(() =>
    props.jump === true
      ? gapRule(
          ranged().map((at) => props.x[at] as number),
          props.values.map((one) => ranged().map((at) => one[at] ?? null)),
        )
      : undefined,
  );
  const indices = (): number[] => {
    const rule = hole();
    return rule === undefined
      ? ranged()
      : rule === "pending"
        ? []
        : ranged().slice(rule.from, rule.to + 1);
  };
  const options = createMemo<RangeOption[]>(() => rangeCounts(props.x, props.values, props.asOf));

  const series = (): ChartSeries[] =>
    props.labels.map((label, index) => ({
      label,
      values: indices().map((at) => props.values[index]?.[at] ?? null),
      colour: props.colours[index] ?? "--c-series-index",
      ...(props.dashes[index] === undefined ? {} : { dash: props.dashes[index] as number[] }),
      ...(props.stepped?.includes(index) === true ? { step: true } : {}),
    }));

  const shown = (): number[] => indices().map((at) => props.x[at] as number);
  const buttons = (): JSX.Element => (
    <RangeButtons options={options()} current={range()} onChange={setRange} />
  );

  // With a lead figure between the title and the chart, the range goes with the
  // chart it changes, not above the figure it does not (review of 2026-09-19).
  return (
    <Section
      title={props.title}
      class={`is-chart ${props.class ?? ""}`.trimEnd()}
      aside={props.lead === undefined ? buttons() : undefined}
    >
      {props.lead}
      <Show when={props.x.length > 0 && hole() !== "pending"} fallback={props.empty}>
        <Show when={props.lead !== undefined}>
          <div class="chart-range">{buttons()}</div>
        </Show>
        <figure class="chart">
          <Show
            when={props.panels}
            fallback={<Chart x={shown()} series={series()} label={props.title} unit={props.unit} />}
          >
            {(panels) => (
              <For each={panels()}>
                {(panel, at) => (
                  <>
                    <Show when={panel.name}>
                      <p class="panel-name">
                        {panel.name} <span>escala propia</span>
                      </p>
                    </Show>
                    <Chart
                      x={shown()}
                      series={panel.series.map((index) => series()[index] as ChartSeries)}
                      bands={series()}
                      label={`${props.title}: ${panel.name ?? "cartera principal y lo aportado"}`}
                      panel={at() === 0 ? "main" : at() === panels().length - 1 ? "end" : "strip"}
                      sync="evolution"
                      dates={at() === panels().length - 1}
                    />
                  </>
                )}
              </For>
            )}
          </Show>
          <figcaption>
            <ChartLegend series={series()} />
          </figcaption>
        </figure>
        <Show when={typeof hole() === "object"}>
          <p class="gap-note">
            Los huecos ocupan más de la mitad de este rango: se enseña el último tramo con datos,
            del {formatDate(props.rows[indices()[0] as number]?.date ?? "")} al{" "}
            {formatDate(props.rows[indices().at(-1) as number]?.date ?? "")}.
          </p>
        </Show>
        {props.foot}
        <ChartTable
          headers={props.labels}
          rows={indices().map((at) => ({
            date: props.rows[at]?.date ?? "",
            values: props.rows[at]?.values ?? [],
          }))}
          caption={props.title}
          unit={props.unit}
          missing={props.missing}
          banded={gapsOf(shown(), series()).length > 0}
        />
      </Show>
      {props.tail}
    </Section>
  );
};
