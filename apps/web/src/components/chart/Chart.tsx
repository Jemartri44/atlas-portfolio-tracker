// The uPlot wrapper (ADR-0017, vendored in `vendor/uplot/`).
//
// **The only file that imports uPlot**, which is what keeps its 21,6 KB gzip
// inside the lazily loaded chunks of Núcleo and Cubo instead of the boot path.
//
// No `use:` directive anywhere (ADR-0017: it is the one thing Solid 2.0 removes
// entirely). The life cycle lives in one `createEffect` and one `onCleanup`
// here, like `main.tsx` and `Dialog.tsx`.
//
// Three rules it enforces so no chart can forget them:
//   1. A `null` is a **hole**: `spanGaps` is off, so the line stops instead of
//      jumping across a stretch where the ledger knows nothing (constitution V).
//   2. Series are told apart by **dash pattern as well as colour** (decision (f)
//      of the 006): a screenshot in black and white still reads.
//   3. `prefers-reduced-motion` is honoured by simply not animating — uPlot
//      redraws, it does not tween, so there is nothing to disable beyond the
//      CSS transition of the container.

import { createEffect, type JSX, onCleanup, onMount } from "solid-js";
import uPlot from "../../../vendor/uplot/uPlot.js";
import { usePrivacy } from "../../ledger/state.js";
import { axisAmount, axisDate, spanOf } from "./axis.js";

export interface ChartSeries {
  label: string;
  /** One value per x, `null` where the ledger has no answer. Never a zero. */
  values: readonly (number | null)[];
  /** Token name, resolved against the stylesheet: no colour is written here. */
  colour: string;
  /** Dash pattern, so the series is told apart without colour. */
  dash?: readonly number[];
}

interface ChartProps {
  /** Seconds since the epoch, ascending. */
  x: readonly number[];
  series: readonly ChartSeries[];
  /** Accessible name; the equivalent table carries the numbers themselves. */
  label: string;
  height?: number;
}

const cssValue = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

export const Chart = (props: ChartProps): JSX.Element => {
  const privacy = usePrivacy();
  let host: HTMLDivElement | undefined;
  let plot: uPlot | undefined;
  let observer: ResizeObserver | undefined;

  const data = (): uPlot.AlignedData =>
    [
      [...props.x],
      ...props.series.map((series) => [...series.values]),
    ] as unknown as uPlot.AlignedData;

  const options = (width: number): uPlot.Options => {
    const from = props.x[0] ?? 0;
    const to = props.x[props.x.length - 1] ?? from;
    const span = spanOf(from, to);
    return {
      width,
      height: props.height ?? 220,
      padding: [8, 8, 0, 0],
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      scales: { x: { time: true } },
      axes: [
        {
          stroke: cssValue("--c-muted"),
          grid: { show: false },
          ticks: { show: false },
          values: (_plot, splits) => splits.map((value) => axisDate(value, span)),
        },
        {
          stroke: cssValue("--c-muted"),
          grid: { stroke: cssValue("--c-border"), width: 1 },
          ticks: { show: false },
          size: 56,
          values: (_plot, splits) => splits.map((value) => axisAmount(value, privacy())),
        },
      ],
      series: [
        {},
        ...props.series.map((series) => ({
          label: series.label,
          stroke: cssValue(series.colour),
          width: 2,
          // The hole, literally: without this uPlot joins the two ends of a gap
          // with a straight line, which is the interpolation the project forbids.
          spanGaps: false,
          ...(series.dash === undefined ? {} : { dash: [...series.dash] }),
          points: { show: props.x.length < 40 },
        })),
      ],
    };
  };

  const build = (): void => {
    if (host === undefined) {
      return;
    }
    plot?.destroy();
    plot = new uPlot(options(host.clientWidth || 320), data(), host);
  };

  onMount(() => {
    build();
    if (host !== undefined && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        if (host !== undefined && plot !== undefined) {
          plot.setSize({ width: host.clientWidth, height: props.height ?? 220 });
        }
      });
      observer.observe(host);
    }
  });

  // Data, privacy and theme all change what is drawn, and uPlot has no partial
  // update for axis formatters: rebuilding is cheap and cannot half-apply.
  createEffect(() => {
    void props.x;
    void props.series;
    void privacy();
    if (plot !== undefined) {
      build();
    }
  });

  onCleanup(() => {
    observer?.disconnect();
    plot?.destroy();
    plot = undefined;
  });

  return <div class="chart" ref={host} role="img" aria-label={props.label} />;
};
