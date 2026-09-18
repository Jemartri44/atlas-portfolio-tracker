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
import { RANGE_LABELS, RangeButtons, type RangeKey, type RangeOption } from "./RangeButtons.jsx";

export interface SeriesCardProps {
  title: string;
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
}

const KEYS: readonly RangeKey[] = ["1M", "1A", "5A", "TODO"];

const RANGE_SECONDS: Record<Exclude<RangeKey, "TODO">, number> = {
  "1M": 31 * 86_400,
  "1A": 366 * 86_400,
  "5A": 1827 * 86_400,
};

export const SeriesCard = (props: SeriesCardProps): JSX.Element => {
  const [range, setRange] = createSignal<RangeKey>("TODO");

  const last = (): number => props.x[props.x.length - 1] ?? 0;

  const indices = createMemo<number[]>(() => {
    const key = range();
    if (key === "TODO") {
      return props.x.map((_, index) => index);
    }
    const from = last() - RANGE_SECONDS[key];
    return props.x.flatMap((value, index) => (value >= from ? [index] : []));
  });

  /**
   * How many points each button would show. A button with none is disabled and
   * says why: with prices recorded once or twice a year, "1 mes" is empty most
   * of the time, and an empty chart reads as a broken chart.
   */
  const options = createMemo<RangeOption[]>(() =>
    KEYS.map((key) => {
      const from = key === "TODO" ? Number.NEGATIVE_INFINITY : last() - RANGE_SECONDS[key];
      const points = props.x.filter(
        (value, index) => value >= from && props.values.some((series) => series[index] !== null),
      ).length;
      return { key, label: RANGE_LABELS[key], points };
    }),
  );

  const series = (): ChartSeries[] =>
    props.labels.map((label, index) => ({
      label,
      values: indices().map((at) => props.values[index]?.[at] ?? null),
      colour: props.colours[index] ?? "--c-muted",
      ...(props.dashes[index] === undefined ? {} : { dash: props.dashes[index] as number[] }),
    }));

  const shown = (): number[] => indices().map((at) => props.x[at] as number);

  return (
    <Section
      title={props.title}
      aside={<RangeButtons options={options()} current={range()} onChange={setRange} />}
    >
      <Show when={props.x.length > 0} fallback={props.empty}>
        <Chart x={shown()} series={series()} label={props.title} />
        <ChartLegend series={series()} />
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
    </Section>
  );
};
