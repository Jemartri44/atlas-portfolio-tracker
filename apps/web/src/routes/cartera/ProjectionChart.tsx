// The projection year by year: the normal case as a line, the band from the pessimistic to the
// optimistic case as a wash between two dotted lines, and what was contributed in dashed grey, as in
// the evolution of the summary, with the equivalent table for whoever does not see the chart. None
// uses the bucket's colour.

import type { JSX } from "solid-js";
import { Chart, type ChartSeries } from "../../components/chart/Chart.jsx";
import { ChartLegend } from "../../components/chart/ChartLegend.jsx";
import { ChartTable } from "../../components/chart/ChartTable.jsx";
import type { ProjectionPlot } from "../../view-models/core/projection.js";

const EDGE_DASH = [2, 3];
const CONTRIBUTED_DASH = [6, 4];

export const ProjectionChart = (props: { plot: ProjectionPlot }): JSX.Element => {
  const series = (): ChartSeries[] => [
    {
      label: "Pesimista",
      values: props.plot.low,
      colour: "--c-series-core",
      dash: EDGE_DASH,
      plain: true,
    },
    {
      label: "Optimista",
      values: props.plot.high,
      colour: "--c-series-core",
      dash: EDGE_DASH,
      plain: true,
      fill: { below: "Pesimista" },
    },
    { label: "Normal", values: props.plot.normal, colour: "--c-series-core" },
    {
      label: "Aportado",
      values: props.plot.contributed,
      colour: "--c-series-contrib",
      dash: CONTRIBUTED_DASH,
      plain: true,
    },
  ];
  return (
    <>
      <figure class="chart">
        <Chart
          x={props.plot.x}
          series={series()}
          label="Proyección año a año: los tres casos y lo aportado"
          unit="eur"
        />
        <figcaption>
          <ChartLegend series={series()} />
        </figcaption>
      </figure>
      <ChartTable
        headers={["Pesimista", "Normal", "Optimista", "Aportado"]}
        rows={props.plot.rows}
        caption="Proyección año a año"
        unit="eur"
      />
    </>
  );
};
