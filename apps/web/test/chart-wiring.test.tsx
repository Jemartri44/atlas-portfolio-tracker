// @vitest-environment happy-dom
//
// The wiring between the data and what is drawn. Everything here survived a
// mutation attack while 973 tests stayed green, which is the definition of a
// test that was looking one floor above the danger.

import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { Allocation } from "../src/components/chart/Allocation.jsx";
import {
  Chart,
  type ChartSeries,
  chartOptions,
  gapsOf,
  hasIsolatedPoint,
} from "../src/components/chart/Chart.jsx";
import { rangeCounts, rangeIndices } from "../src/components/chart/ranges.js";

const disposers: (() => void)[] = [];

const mount = (component: () => unknown): HTMLElement => {
  const host = document.createElement("div");
  document.body.append(host);
  disposers.push(render(component as never, host));
  return host;
};

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  document.body.innerHTML = "";
});

const DAY = 86_400;
const SERIES: ChartSeries[] = [
  { label: "Núcleo", values: [100, null, 300], colour: "--c-series-core" },
  { label: "Cubo", values: [10, 20, null], colour: "--c-series-bucket", dash: [6, 4] },
];
const X = [0, DAY, 2 * DAY];

/** The Y axis formatter uPlot is handed, applied to a couple of splits. */
const yLabels = (privacy: boolean): string[] => {
  const options = chartOptions({ x: X, series: SERIES, width: 320, height: 220 }, privacy);
  const axis = options.axes?.[1] as { values: (p: unknown, s: number[]) => string[] };
  return axis.values(undefined, [1000, 25_000]);
};

describe("the axis of a chart is an amount", () => {
  /**
   * The condition the direction attached to authorising `chart/axis.ts`. Before
   * this, taking the privacy flag out of the axis left every chart showing
   * absolute amounts in privacy mode and the whole suite green.
   */
  it("carries no figure at all when privacy is on", () => {
    // Not even the mask: four dots on each line of the grid would add noise
    // and say nothing. The shape of the lines is what stays useful in public.
    expect(yLabels(true)).toEqual(["", ""]);
    expect(yLabels(true).join("")).not.toMatch(/\d/);
  });

  it("shows the figures when privacy is off", () => {
    expect(yLabels(false)).toEqual(["1 k", "25 k"]);
  });

  it("dates the X axis with the span the data covers", () => {
    const options = chartOptions({ x: X, series: SERIES, width: 320, height: 220 }, false);
    const axis = options.axes?.[0] as { values: (p: unknown, s: number[]) => string[] };
    expect(axis.values(undefined, [0])).toHaveLength(1);
    expect(axis.values(undefined, [0])[0]).not.toBe("");
  });
});

describe("a hole is a hole", () => {
  /**
   * The line stops at a hole, and the stretch it skips is **shown** as a band
   * from the last known point to the next one, so a gap reads as a gap and
   * not as a chart that failed to load (docs/design/system.md §5.15).
   */
  it("shades the stretch where a series has no value, from known point to known point", () => {
    expect(gapsOf(X, SERIES)).toEqual([{ from: 0, to: 2 * DAY }]);
    // A chart with no hole has nothing to shade.
    const full: ChartSeries[] = [{ label: "Núcleo", values: [1, 2, 3], colour: "--c-series-core" }];
    expect(gapsOf(X, full)).toEqual([]);
    // A series with no value at all is not "a hole everywhere": it is absent.
    const absent: ChartSeries[] = [
      ...full,
      { label: "Cubo", values: [null, null, null], colour: "--c-series-bucket" },
    ];
    expect(gapsOf(X, absent)).toEqual([]);
  });

  /**
   * `spanGaps: true` makes uPlot join the two ends of a gap with a straight
   * line — the interpolation the whole feature exists to refuse. It is the
   * central rule of prompt 007 §3.3 and it had no test at all.
   */
  it("never lets uPlot span a gap", () => {
    const options = chartOptions({ x: X, series: SERIES, width: 320, height: 220 }, false);
    const drawn = (options.series ?? []).slice(1) as { spanGaps?: boolean }[];

    expect(drawn).toHaveLength(2);
    for (const series of drawn) {
      expect(series.spanGaps).toBe(false);
    }
  });

  it("keeps the dash of each series, so colour is not the only difference", () => {
    const options = chartOptions({ x: X, series: SERIES, width: 320, height: 220 }, false);
    const drawn = (options.series ?? []).slice(1) as { dash?: number[] }[];

    expect(drawn[0]?.dash).toBeUndefined();
    expect(drawn[1]?.dash).toEqual([6, 4]);
  });

  it("draws no legend of its own: ours carries the dash as well as the colour", () => {
    const options = chartOptions({ x: X, series: SERIES, width: 320, height: 220 }, false);
    expect((options.legend as { show: boolean }).show).toBe(false);
  });

  /**
   * A value with a hole on each side has no segment to be part of. Hiding the
   * dots on a crowded chart then erases it: a date the ledger does know about,
   * absent from the chart. With prices recorded once or twice a year that is
   * the normal case, not the corner one.
   */
  it("spots the value that only a dot can draw", () => {
    // Both ends of a three-point series with a hole in the middle are lone
    // values: neither has a neighbour to draw a segment to.
    expect(hasIsolatedPoint([100, null, 300])).toBe(true);
    expect(hasIsolatedPoint([null, 200, null])).toBe(true);
    expect(hasIsolatedPoint([null, null, 300])).toBe(true);
    expect(hasIsolatedPoint([500])).toBe(true);
    // A pair that touches draws a line, and a series of holes draws nothing.
    expect(hasIsolatedPoint([100, 200, null])).toBe(false);
    expect(hasIsolatedPoint([100, 200, 300])).toBe(false);
    expect(hasIsolatedPoint([null, null])).toBe(false);
  });

  it("keeps the dots on a crowded chart only for the series that needs them", () => {
    const many = Array.from({ length: 60 }, (_, index) => index * DAY);
    const dense = many.map((_, index) => index);
    const lonely = many.map((_, index) => (index === 30 ? 7 : null));
    const options = chartOptions(
      {
        x: many,
        series: [
          { label: "Densa", values: dense, colour: "--c-series-core" },
          { label: "Sola", values: lonely, colour: "--c-series-bucket" },
        ],
        width: 320,
        height: 220,
      },
      false,
    );
    const drawn = (options.series ?? []).slice(1) as { points?: { show?: boolean } }[];

    expect(drawn[0]?.points?.show).toBe(false);
    expect(drawn[1]?.points?.show).toBe(true);
  });
});

describe("the life cycle of the chart", () => {
  /**
   * `happy-dom` has no 2D canvas context, which is exactly the situation of a
   * browser that refuses one. uPlot throws from inside a microtask while
   * drawing, and no `try` around the constructor catches it: before the guard,
   * the whole screen died through the error boundary because of a chart that is
   * **informative** (constitution II). Degrading costs nothing — the equivalent
   * table under every chart carries the same numbers.
   */
  it("degrades instead of dying when the browser cannot paint a canvas", () => {
    expect(() =>
      mount(() => <Chart x={X} series={SERIES} label="Evolución del patrimonio" height={180} />),
    ).not.toThrow();
  });

  it("leaves an accessible name on the container, whether it painted or not", () => {
    const host = mount(() => <Chart x={X} series={SERIES} label="Evolución del patrimonio" />);
    const figure = host.querySelector('[role="img"]');

    expect(figure).not.toBeNull();
    expect(figure?.getAttribute("aria-label")).toBe("Evolución del patrimonio");
  });

  it("unmounts without throwing, so moving between screens leaks nothing", () => {
    mount(() => <Chart x={X} series={SERIES} label="Evolución del patrimonio" />);

    expect(() => {
      for (const dispose of disposers.splice(0)) {
        dispose();
      }
    }).not.toThrow();
  });
});

describe("the range buttons", () => {
  const x = [0, 300 * DAY, 1000 * DAY, 2000 * DAY];
  const values = [[1, 2, 3, 4]];

  it("counts the points inside each window", () => {
    const counts = rangeCounts(x, values);
    const of = (key: string): number => counts.find((c) => c.key === key)?.points ?? -1;

    // The last point is day 2000, so the windows reach back to days 173
    // (5 años), 1.634 (1 año) and 1.969 (1 mes).
    expect(of("TODO")).toBe(4);
    expect(of("5A")).toBe(3);
    expect(of("1A")).toBe(1);
    expect(of("1M")).toBe(1);
  });

  /**
   * A point whose every series is a hole is not a point: counting the dates
   * instead would light up a button that opens onto nothing.
   */
  it("does not count a date where every series is a hole", () => {
    const holes = [[1, null, null, null]];
    const counts = rangeCounts(x, holes);

    expect(counts.find((c) => c.key === "TODO")?.points).toBe(1);
    // Day 0 is outside the five-year window, and the three dates inside it are
    // all holes: the button would open onto nothing.
    expect(counts.find((c) => c.key === "5A")?.points).toBe(0);
  });

  it("selects the same indices the counting promised", () => {
    expect(rangeIndices(x, "TODO")).toEqual([0, 1, 2, 3]);
    expect(rangeIndices(x, "5A")).toEqual([1, 2, 3]);
    expect(rangeIndices(x, "1A")).toEqual([3]);
  });

  it("says nothing about an empty series instead of failing", () => {
    expect(rangeCounts([], []).every((c) => c.points === 0)).toBe(true);
    expect(rangeIndices([], "1A")).toEqual([]);
  });
});

describe("the allocation bar", () => {
  const segments = [
    { key: "equity", label: "Renta variable", actualPct: "20", targetPct: "55" },
    { key: "fixed_income", label: "Renta fija", actualPct: "80", targetPct: "45" },
  ];

  /**
   * The mutation that deleted the target bar outright — half of the comparison —
   * and nobody noticed. The card exists to compare two things; if one of them
   * can vanish silently, the card is decoration.
   */
  it("draws both bars: what there is and what the plan says", () => {
    const host = mount(() => <Allocation segments={segments} />);
    const titles = [...host.querySelectorAll("rect title")].map((t) => t.textContent ?? "");

    expect(titles.filter((t) => t.startsWith("Actual:"))).toHaveLength(2);
    expect(titles.filter((t) => t.startsWith("Objetivo:"))).toHaveLength(2);
  });

  it("scales each segment to its share, not to its raw number", () => {
    const host = mount(() => <Allocation segments={segments} />);
    const widths = [...host.querySelectorAll("rect")].map((r) => r.getAttribute("width"));

    expect(widths.slice(0, 2)).toEqual(["20%", "80%"]);
    expect(widths.slice(2)).toEqual(["55%", "45%"]);
  });

  it("stacks them: each one starts where the previous ended", () => {
    const host = mount(() => <Allocation segments={segments} />);
    const xs = [...host.querySelectorAll("rect")].map((r) => r.getAttribute("x"));

    expect(xs.slice(0, 2)).toEqual(["0%", "20%"]);
    expect(xs.slice(2)).toEqual(["0%", "55%"]);
  });

  /** A partial core has no current weights: the top bar says so instead of lying. */
  it("draws an empty bar, not a wrong one, when there is no current weight", () => {
    const host = mount(() => (
      <Allocation segments={[{ key: "equity", label: "Renta variable", targetPct: "100" }]} />
    ));
    const titles = [...host.querySelectorAll("rect title")].map((t) => t.textContent ?? "");

    expect(titles.some((t) => t.includes("Sin datos"))).toBe(true);
    expect(titles.filter((t) => t.startsWith("Actual:"))).toHaveLength(0);
  });

  it("carries percentages only, so the privacy mode has nothing to hide", () => {
    const host = mount(() => <Allocation segments={segments} />);
    expect(host.textContent).not.toContain("EUR");
  });
});
