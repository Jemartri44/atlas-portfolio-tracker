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
//   4. A hole is not only left undrawn, it is **shown** (docs/design/system.md
//      §5.15): a quiet band over the stretch the ledger knows nothing about,
//      with dashed edges and "sin precios" on top, so a gap reads as a gap and
//      not as a chart that failed to load.

import { createEffect, type JSX, onCleanup, onMount } from "solid-js";
import uPlot from "../../../vendor/uplot/uPlot.js";
import { store, usePrivacy } from "../../ledger/state.js";
import { gapsOf } from "./gaps.js";
import { type ChartSeries, type ChartSpec, chartOptions, hasIsolatedPoint } from "./options.js";

interface ChartProps {
  /** Seconds since the epoch, ascending. */
  x: readonly number[];
  series: readonly ChartSeries[];
  /** Accessible name; the equivalent table carries the numbers themselves. */
  label: string;
  height?: number;
  unit?: "eur" | "pct" | undefined;
  /** The class of the frame: a panel and a strip of a stack have their own height. */
  panel?: "main" | "strip" | "end" | undefined;
  sync?: string | undefined;
  dates?: boolean | undefined;
  /** The series whose holes are shaded, when they are not the ones drawn. */
  bands?: readonly ChartSeries[] | undefined;
}

const DEFAULT_HEIGHT = 184;

export { type ChartSeries, type ChartSpec, chartOptions, gapsOf, hasIsolatedPoint };

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
          height: props.height ?? (host.clientHeight || DEFAULT_HEIGHT),
          ...(props.unit === undefined ? {} : { unit: props.unit }),
          ...(props.sync === undefined ? {} : { sync: props.sync }),
          ...(props.dates === undefined ? {} : { dates: props.dates }),
          ...(props.bands === undefined ? {} : { bands: props.bands }),
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
          plot.setSize({
            width: host.clientWidth,
            height: props.height ?? (host.clientHeight || DEFAULT_HEIGHT),
          });
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
    void store.theme();
    if (plot !== undefined) {
      build();
    }
  });

  onCleanup(() => {
    observer?.disconnect();
    plot?.destroy();
    plot = undefined;
  });

  return (
    <div
      class={props.panel === undefined ? "chart-plot" : `chart-plot is-${props.panel}`}
      ref={host}
      role="img"
      aria-label={props.label}
    />
  );
};
