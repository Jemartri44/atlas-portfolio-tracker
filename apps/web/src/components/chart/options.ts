// The options uPlot is built with, as a pure function of the data and the
// privacy flag (split from `Chart.tsx`, which keeps the life cycle): the rules
// that live here can be asserted without a canvas. See `Chart.tsx` for the
// four rules every chart obeys.

import uPlot from "../../../vendor/uplot/uPlot.js";
import { axisAmount, axisDates, axisPercents, spanOf } from "./axis.js";
import { drawGaps, gapsOf } from "./gaps.js";

export interface ChartSeries {
  label: string;
  /** One value per x, `null` where the ledger has no answer. Never a zero. */
  values: readonly (number | null)[];
  /** Token name, resolved against the stylesheet: no colour is written here. */
  colour: string;
  /** Dash pattern, so the series is told apart without colour. */
  dash?: readonly number[];
  /**
   * Drawn as a step, holding its value until the next date (what was
   * contributed: a deposit moves it on its day and not before). A series of
   * this kind has no holes by construction, so it takes no part in where the
   * bands of the holes go (feature 020, E4, M3).
   */
  step?: boolean | undefined;
}

type SteppedFactory = (options: { align: 1 | -1 }) => uPlot.Series.PathBuilder;

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

const cssValue = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

/** The type of the axes: the family of the page, at the smallest step it reads. */
const axisFont = (): string => `13px ${cssValue("--font-sans")}`;

export interface ChartSpec {
  x: readonly number[];
  series: readonly ChartSeries[];
  width: number;
  height: number;
  /** What the Y axis measures; euros by default. A share is not withheld with the privacy on. */
  unit?: "eur" | "pct";
  /** Charts of the same key move their cursor together: the panels of an evolution. */
  sync?: string;
  /** The axis of the dates; only the last of a stack of panels needs it. */
  dates?: boolean;
  /** The series whose holes are shaded, when they are not the ones drawn. */
  bands?: readonly ChartSeries[];
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
/** The least room, in CSS pixels, between two labels of the date axis. */
const SPACE = { days: 56, months: 88, years: 56 } as const;

export const chartOptions = (spec: ChartSpec, privacy: boolean): uPlot.Options => {
  const from = spec.x[0] ?? 0;
  const to = spec.x[spec.x.length - 1] ?? from;
  const span = spanOf(from, to);
  // Only an amount is withheld: a share of what was contributed gives nothing away.
  const masked = privacy && spec.unit !== "pct";
  return {
    width: spec.width,
    height: spec.height,
    // Room on the right for half of the last date, which uPlot centres on its
    // tick: at the edge of a phone «dic 2028» was cut to «dic 20».
    padding: [8, SPACE[span] / 2 - 16, 0, 0],
    legend: { show: false },
    cursor: {
      drag: { x: false, y: false },
      ...(spec.sync === undefined ? {} : { sync: { key: spec.sync } }),
    },
    scales: { x: { time: true } },
    hooks: { drawClear: [drawGaps(gapsOf(spec.x, spec.bands ?? spec.series))] },
    axes: [
      {
        show: spec.dates !== false,
        stroke: cssValue("--c-text-3"),
        font: axisFont(),
        grid: { show: false },
        ticks: { show: false },
        // The least room between two dates: «sept 2026» is wider than «2026»,
        // and at uPlot's default of 50 px the months ran into each other.
        space: SPACE[span],
        values: (_plot, splits) => axisDates(splits, span),
      },
      {
        stroke: cssValue("--c-text-3"),
        font: axisFont(),
        grid: { stroke: cssValue("--c-chart-grid"), width: 1 },
        ticks: { show: false },
        // No figure with the mask (brief §7); off, «0 €» clear of the plot (PR #105).
        size: masked ? 8 : 60,
        gap: masked ? 0 : 10,
        values: (_plot, splits) =>
          spec.unit === "pct"
            ? axisPercents(splits)
            : splits.map((value) => axisAmount(value, masked)),
      },
    ],
    series: [
      {},
      ...spec.series.map((series) => ({
        label: series.label,
        stroke: cssValue(series.colour),
        width: 2,
        cap: "round" as CanvasLineCap,
        spanGaps: false,
        ...(series.step === true
          ? { paths: (uPlot.paths.stepped as SteppedFactory)({ align: 1 }) }
          : {}),
        // uPlot draws on a canvas of device pixels and does not scale a dash:
        // at 3x a dotted line came out solid on the phone.
        ...(series.dash === undefined
          ? {}
          : { dash: series.dash.map((step) => step * (window.devicePixelRatio || 1)) }),
        // Crowded charts hide their dots, **except** where a dot is the only
        // way a value gets drawn at all.
        points: {
          show: spec.x.length < DOTS_UP_TO || hasIsolatedPoint(series.values),
          size: 8,
          fill: cssValue("--c-surface"),
        },
      })),
    ],
  };
};
