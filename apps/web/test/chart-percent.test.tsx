// @vitest-environment happy-dom
//
// M7 (feature 020, E4): the bucket against the index in percent of what was
// contributed, and the rule of the holes. A share does not give the size of
// the money away, so it is drawn with the privacy on, axis included.

import { Decimal } from "@atlas/domain";
import type { BucketIndexPctSeries } from "@atlas/domain/charts";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { axisPercents } from "../src/components/chart/axis.js";
import { type ChartSeries, chartOptions } from "../src/components/chart/Chart.jsx";
import { SeriesCard } from "../src/components/chart/SeriesCard.jsx";
import { store } from "../src/ledger/state.js";
import { bucketIndexPlot, gapRule, secondsOf } from "../src/view-models/series.js";

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  document.body.innerHTML = "";
  store.setPrivacy(false);
});

const mount = (component: () => unknown): HTMLElement => {
  const host = document.createElement("div");
  document.body.append(host);
  disposers.push(render(component as never, host));
  return host;
};

const DAY = 86_400;

describe("gapRule: more than half of the range in holes", () => {
  // Eleven days, a width of ten. A hole is shaded from the last known point
  // before it to the first one after it.
  const x = Array.from({ length: 11 }, (_, index) => index * DAY);
  const withHole = (from: number, to: number) =>
    x.map((_, index) => (index >= from && index <= to ? null : index));

  it("does nothing while the holes are half the width or less, half included", () => {
    expect(gapRule(x, [withHole(1, 3)])).toBeUndefined();
    // Band from day 0 to day 5: exactly half.
    expect(gapRule(x, [withHole(1, 4)])).toBeUndefined();
  });

  it("jumps just past the half, to the last stretch with data", () => {
    expect(gapRule(x, [withHole(1, 5)])).toEqual({ from: 6, to: 10 });
  });

  it("measures the half in width, not in points", () => {
    const uneven = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 100].map((day) => day * DAY);
    // Six of eleven points are holes, but they cover 7 days of 100.
    expect(gapRule(uneven, [withHole(1, 6)])).toBeUndefined();
    // One hole in the middle of a short stretch before a far point covers 97 of 100.
    expect(gapRule(uneven, [withHole(4, 9)])).toEqual({ from: 10, to: 10 });
  });

  it("is pending when no series has a value anywhere", () => {
    expect(gapRule(x, [x.map(() => null)])).toBe("pending");
  });

  it("takes a point with a value in any series as known", () => {
    const second = x.map((_, index) => (index === 3 ? 1 : null));
    expect(gapRule(x, [withHole(1, 5), second])).toEqual({ from: 6, to: 10 });
    expect(gapRule(x, [withHole(1, 7), second])).toEqual({ from: 8, to: 10 });
  });
});

describe("the percentage axis", () => {
  it("has the decimals its steps need, with the unit and a no-break space", () => {
    expect(axisPercents([0, 5, 10])).toEqual(["0 %", "5 %", "10 %"]);
    expect(axisPercents([0, 2.5, 5])).toEqual(["0,0 %", "2,5 %", "5,0 %"]);
    expect(axisPercents([0, 0.25, 0.5])).toEqual(["0,00 %", "0,25 %", "0,50 %"]);
    expect(axisPercents([-5, 0, 5])[0]).toBe("−5 %");
  });

  const series: ChartSeries[] = [{ label: "Cubo", values: [1, 2], colour: "--c-series-bucket" }];
  const axisOf = (privacy: boolean, unit?: "pct") =>
    chartOptions(
      { x: [0, DAY], series, width: 320, height: 200, ...(unit ? { unit } : {}) },
      privacy,
    ).axes?.[1] as { size: number; values: (p: unknown, s: number[]) => string[] };

  it("is drawn with the privacy on, unlike the axis of the euros", () => {
    expect(axisOf(true, "pct").values(undefined, [0, 5])).toEqual(["0 %", "5 %"]);
    expect(axisOf(true, "pct").size).toBe(60);
    expect(axisOf(true).values(undefined, [1000])).toEqual([""]);
    expect(axisOf(true).size).toBe(8);
  });
});

describe("the bucket against the index, in percent", () => {
  const point = (date: string, pct?: [string, string, string]) => ({
    date,
    ...(pct === undefined
      ? {}
      : {
          result_pct: Decimal.parse(pct[0]),
          benchmark_pct: Decimal.parse(pct[1]),
          vs_index_pct: Decimal.parse(pct[2]),
        }),
    missing: [],
    idle: 0,
  });
  const series: BucketIndexPctSeries = {
    from: "2027-01-01",
    to: "2027-06-30",
    complete: 2,
    points: [
      point("2027-01-01", ["0", "0", "0"]),
      point("2027-03-01"),
      point("2027-06-30", ["10", "4", "6"]),
    ],
  };

  it("keeps the decimal strings of the domain for the table and the numbers for the line", () => {
    const plot = bucketIndexPlot(series);
    expect(plot.values).toEqual([
      [0, null, 10],
      [0, null, 4],
    ]);
    expect(plot.rows.map((row) => row.values)).toEqual([
      ["0", "0"],
      [undefined, undefined],
      ["10", "4"],
    ]);
    expect(plot.x[0]).toBe(secondsOf("2027-01-01"));
    expect([plot.drawn, plot.total]).toEqual([2, 3]);
    expect(plot.missing?.line).toContain("En 1 de 3 fechas");
  });

  it("leaves out the dates before the bucket has anything to compare: they are no hole", () => {
    const quiet = (date: string, reason: "no_investments" | "no_contributions") => ({
      date,
      reason,
      missing: [],
      idle: 0,
    });
    const plot = bucketIndexPlot({
      ...series,
      points: [
        quiet("2026-11-01", "no_investments"),
        quiet("2026-12-01", "no_contributions"),
        ...series.points,
      ],
    });
    expect(plot.x).toHaveLength(3);
    expect([plot.drawn, plot.total]).toEqual([2, 3]);
    // The hole of 01/03 is still said, and the quiet dates are not counted in it.
    expect(plot.missing?.line).toContain("En 1 de 3 fechas");
    expect(plot.idle).toBeUndefined();
  });

  it("gives the reason of the last date when nothing else is left, and no points", () => {
    const quiet = (date: string, reason: "no_investments" | "no_contributions") => ({
      date,
      reason,
      missing: [],
      idle: 0,
    });
    const plot = bucketIndexPlot({
      ...series,
      points: [quiet("2026-11-01", "no_investments"), quiet("2026-12-01", "no_contributions")],
    });
    expect(plot.x).toEqual([]);
    expect(plot.idle).toBe("no_contributions");
    expect(plot.missing).toBeUndefined();
    // A series with no dates at all has nothing to say about why.
    expect(bucketIndexPlot({ ...series, points: [] }).idle).toBeUndefined();
  });

  it("says no reason when the quiet dates are followed by a missing price", () => {
    const quiet = {
      date: "2027-01-01",
      reason: "no_investments" as const,
      missing: [],
      idle: 0,
    };
    const plot = bucketIndexPlot({
      ...series,
      points: [quiet, point("2027-02-01"), point("2027-06-30")],
    });
    expect(plot.idle).toBeUndefined();
    expect(plot.missing?.line).toContain("En 2 de 2 fechas");
  });

  it("leaves out a date with a reason after a missing price too, and keeps the reason", () => {
    const quiet = (date: string) => ({
      date,
      reason: "no_contributions" as const,
      missing: [],
      idle: 0,
    });
    // Purchases and no deposit, and the price of one date is missing: the hole is
    // a hole, and the dates after it are no hole, they have a reason.
    const plot = bucketIndexPlot({
      ...series,
      points: [point("2027-02-01"), quiet("2027-02-15"), quiet("2027-03-01")],
    });
    expect([plot.drawn, plot.total]).toEqual([0, 1]);
    expect(plot.x).toEqual([secondsOf("2027-02-01")]);
    expect(plot.missing?.line).toContain("En 1 de 1 fechas");
    expect(plot.idle).toBe("no_contributions");
    // With a percentage drawn later, the quiet dates in between are not counted.
    const later = bucketIndexPlot({
      ...series,
      points: [point("2027-02-01"), quiet("2027-02-15"), series.points[2] as never],
    });
    expect([later.drawn, later.total]).toEqual([1, 2]);
    expect(later.idle).toBeUndefined();
  });

  it("says nothing is missing when every point has its percentage", () => {
    expect(
      bucketIndexPlot({ ...series, points: [series.points[0], series.points[2]] as never }).missing,
    ).toBeUndefined();
  });
});

const card = (privacy: boolean) => {
  store.setPrivacy(privacy);
  const x = ["2027-01-01", "2027-02-01", "2027-03-01", "2027-04-01", "2027-05-01", "2027-06-01"];
  const known = [null, null, null, null, 3.5, 4];
  return mount(() => (
    <SeriesCard
      title="Frente al índice"
      asOf="2027-06-01"
      unit="pct"
      jump
      labels={["Resultado del cubo"]}
      colours={["--c-series-bucket"]}
      dashes={[undefined]}
      x={x.map(secondsOf)}
      values={[known]}
      rows={x.map((date, index) => ({
        date,
        values: [known[index] === null ? undefined : String(known[index])],
      }))}
      empty={<p>nada</p>}
    />
  ));
};

describe("the card of the bucket against the index", () => {
  it("jumps to the last stretch with data and says so, with the dates", () => {
    const host = card(false);
    const note = host.querySelector(".gap-note");
    expect(note?.textContent).toContain("Los huecos ocupan más de la mitad");
    expect(note?.textContent).toContain("01/05/2027");
    expect(note?.textContent).toContain("01/06/2027");
  });

  it("shows the table in percent, with no mask, with the privacy on", () => {
    const host = card(true);
    const body = host.textContent ?? "";
    expect(body).toContain("3,5\u00a0%");
    expect(body).toContain("4,0\u00a0%");
    expect(body).not.toContain("•");
  });

  it("shows the pending block, and no chart, when nothing has data", () => {
    const x = ["2027-01-01", "2027-02-01"];
    const host = mount(() => (
      <SeriesCard
        title="Frente al índice"
        asOf="2027-02-01"
        unit="pct"
        jump
        labels={["Resultado del cubo"]}
        colours={["--c-series-bucket"]}
        dashes={[undefined]}
        x={x.map(secondsOf)}
        values={[[null, null]]}
        rows={x.map((date) => ({ date, values: [undefined] }))}
        empty={<p>nada</p>}
      />
    ));
    expect(host.textContent).toContain("nada");
    expect(host.querySelector("figure.chart")).toBeNull();
  });
});
