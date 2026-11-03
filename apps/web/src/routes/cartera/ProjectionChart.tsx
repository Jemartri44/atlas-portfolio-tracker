// The projection year by year: a line per scenario that has a figure and what was contributed in
// dashed grey, as in the evolution of the summary, with the equivalent table for whoever does not
// see the chart. The scenarios share the colour of the core and are told apart by their dash (the
// colour is never the only carrier of meaning); none uses the bucket's colour.

import type { JSX } from "solid-js";
import { Chart, type ChartSeries } from "../../components/chart/Chart.jsx";
import { ChartLegend } from "../../components/chart/ChartLegend.jsx";
import { ChartTable } from "../../components/chart/ChartTable.jsx";
import type { ProjectionPlot } from "../../view-models/core/projection.js";

const SCENARIO_DASHES: readonly (readonly number[] | undefined)[] = [
  undefined,
  [2, 3],
  [10, 3, 2, 3],
];
const CONTRIBUTED_DASH = [6, 4];

export const ProjectionChart = (props: { plot: ProjectionPlot }): JSX.Element => {
  const series = (): ChartSeries[] =>
    props.plot.labels.map((label, at) => {
      const contributed = at === props.plot.labels.length - 1;
      const dash = contributed ? CONTRIBUTED_DASH : SCENARIO_DASHES[at];
      return {
        label,
        values: props.plot.values[at] ?? [],
        colour: contributed ? "--c-series-contrib" : "--c-series-core",
        ...(dash === undefined ? {} : { dash: [...dash] }),
      };
    });
  return (
    <>
      <figure class="chart">
        <Chart
          x={props.plot.x}
          series={series()}
          label="Proyección año a año: el valor de cada escenario y lo aportado"
          unit="eur"
        />
        <figcaption>
          <ChartLegend series={series()} />
        </figcaption>
      </figure>
      <ChartTable
        headers={props.plot.labels}
        rows={props.plot.rows}
        caption="Proyección año a año"
        unit="eur"
      />
    </>
  );
};
