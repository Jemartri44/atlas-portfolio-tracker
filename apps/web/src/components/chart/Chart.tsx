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

const DEFAULT_HEIGHT = 220;

/** Above this many points the dots crowd the line and are hidden. */
const DOTS_UP_TO = 40;

/**
 * Whether a series holds a value with a hole on **both** sides (or with no
 * neighbour at all).
 *
 * A line is drawn between two consecutive values; a value alone between two
 * holes has nothing to join, so with the dots hidden it is not drawn at all —
 * a date the ledger *does* know about, missing from the chart. Exactly the
 * situation this feature's ledger is in most of the time: prices recorded once
 * or twice a year, and one lonely valuation in between.
 */
export const hasIsolatedPoint = (values: readonly (number | null)[]): boolean =>
  values.some(
    (value, index) =>
      value !== null &&
      (values[index - 1] ?? null) === null &&
      (values[index + 1] ?? null) === null,
  );

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

export interface ChartSpec {
  x: readonly number[];
  series: readonly ChartSeries[];
  width: number;
  height: number;
}

/**
 * The options uPlot is built with, as a **pure function of the data and the
 * privacy flag**, so the two rules that live in here can be asserted without a
 * canvas:
 *
 *   1. the Y axis asks `axisAmount` for its labels **with the privacy flag** —
 *      the axis of a chart is an amount for every purpose, and with the mask on
 *      there can be no absolute figure on it;
 *   2. every series carries `spanGaps: false` — a `null` is a hole, and without
 *      this uPlot joins its two ends with a straight line, which is exactly the
 *      interpolation this feature exists to refuse.
 *
 * Both used to be unreachable from a test: they were expressions inside the
 * component, and a mutation of either left the whole suite green.
 */
export const chartOptions = (spec: ChartSpec, privacy: boolean): uPlot.Options => {
  const from = spec.x[0] ?? 0;
  const to = spec.x[spec.x.length - 1] ?? from;
  const span = spanOf(from, to);
  return {
    width: spec.width,
    height: spec.height,
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
        values: (_plot, splits) => splits.map((value) => axisAmount(value, privacy)),
      },
    ],
    series: [
      {},
      ...spec.series.map((series) => ({
        label: series.label,
        stroke: cssValue(series.colour),
        width: 2,
        spanGaps: false,
        ...(series.dash === undefined ? {} : { dash: [...series.dash] }),
        // Crowded charts hide their dots, **except** where a dot is the only
        // way a value gets drawn at all.
        points: { show: spec.x.length < DOTS_UP_TO || hasIsolatedPoint(series.values) },
      })),
    ],
  };
};

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

  /**
   * Whether this browser can actually paint on a canvas. Without a 2D context
   * uPlot throws from inside a microtask while drawing, which no `try` around
   * the constructor catches: the screen dies and the error boundary shows a
   * failure for a chart that is **informative** (constitution II).
   *
   * Degrading is the right answer and costs nothing: the equivalent table under
   * every chart carries the same numbers, and it is the accessible copy anyway.
   */
  const canDraw = (): boolean => {
    try {
      return document.createElement("canvas").getContext("2d") !== null;
    } catch {
      // A browser that refuses to create a canvas at all: same conclusion.
      return false;
    }
  };

  const build = (): void => {
    if (host === undefined || !canDraw()) {
      return;
    }
    plot?.destroy();
    plot = new uPlot(
      chartOptions(
        {
          x: props.x,
          series: props.series,
          width: host.clientWidth || 320,
          height: props.height ?? DEFAULT_HEIGHT,
        },
        privacy(),
      ),
      data(),
      host,
    );
  };

  onMount(() => {
    build();
    if (host !== undefined && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        if (host !== undefined && plot !== undefined) {
          plot.setSize({ width: host.clientWidth, height: props.height ?? DEFAULT_HEIGHT });
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
