// The holes of a chart, **shown** (docs/design/system.md §5.15): the line stops
// where the ledger knows nothing, and the stretch it skips is painted as a
// quiet band with dashed edges and "sin precios" on top, so a gap reads as a
// gap and not as a chart that failed to load. Where the band goes is a pure
// function of the data, so it can be asserted without a canvas.

import type uPlot from "../../../vendor/uplot/uPlot.js";
import type { ChartSeries } from "./Chart.jsx";

/** The smallest band worth a label, in CSS pixels. */
const LABELLED_GAP = 72;

const cssValue = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

/**
 * The stretches of the X axis where some series has no value: from the last
 * known point before the hole to the first known one after it (or the edge of
 * the chart). Pure, so what is shaded can be asserted without a canvas.
 */
export const gapsOf = (
  x: readonly number[],
  series: readonly ChartSeries[],
): { from: number; to: number }[] => {
  const holes = x.map((_, index) =>
    series.some(
      (one) => (one.values[index] ?? null) === null && one.values.some((v) => v !== null),
    ),
  );
  const gaps: { from: number; to: number }[] = [];
  for (let index = 0; index < x.length; index += 1) {
    if (!holes[index]) {
      continue;
    }
    let end = index;
    while (end + 1 < x.length && holes[end + 1]) {
      end += 1;
    }
    const from = x[Math.max(0, index - 1)] as number;
    const to = x[Math.min(x.length - 1, end + 1)] as number;
    if (to > from) {
      gaps.push({ from, to });
    }
    index = end;
  }
  return gaps;
};

/** Paints the bands of the holes under the lines, from the tokens of the theme. */
export const drawGaps =
  (gaps: readonly { from: number; to: number }[]) =>
  (plot: uPlot): void => {
    if (gaps.length === 0) {
      return;
    }
    const { ctx, bbox } = plot;
    const ratio = window.devicePixelRatio || 1;
    ctx.save();
    for (const gap of gaps) {
      const left = plot.valToPos(gap.from, "x", true);
      const right = plot.valToPos(gap.to, "x", true);
      ctx.fillStyle = cssValue("--c-chart-gap");
      ctx.fillRect(left, bbox.top, right - left, bbox.height);
      ctx.strokeStyle = cssValue("--c-chart-gap-edge");
      ctx.lineWidth = ratio;
      ctx.setLineDash([3 * ratio, 3 * ratio]);
      for (const edge of [left, right]) {
        ctx.beginPath();
        ctx.moveTo(edge, bbox.top);
        ctx.lineTo(edge, bbox.top + bbox.height);
        ctx.stroke();
      }
      if (right - left >= LABELLED_GAP * ratio) {
        ctx.setLineDash([]);
        ctx.fillStyle = cssValue("--c-text-3");
        ctx.font = `${13 * ratio}px ${cssValue("--font-sans")}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("sin precios", (left + right) / 2, bbox.top + 4 * ratio);
      }
    }
    ctx.restore();
  };
