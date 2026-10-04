// @vitest-environment happy-dom
//
// M3 (feature 020, E4): the evolution in panels. What was contributed is a
// step in the main panel; the bucket and the cash are strips with a scale of
// their own; all of them share the dates and the cursor. The privacy mode
// takes the figures off the axes and the table, never the shape.

import { type LedgerEvent, netWorthSeries } from "@atlas/domain";
import { bookCashSeries, contributedSeries } from "@atlas/domain/charts";
import { describe, expect, it } from "vitest";
import { type ChartSeries, chartOptions, gapsOf } from "../src/components/chart/Chart.jsx";
import { store } from "../src/ledger/state.js";
import Resumen from "../src/routes/resumen/index.jsx";
import {
  netWorthPlot,
  secondsOf,
  withBookCash,
  withContributed,
} from "../src/view-models/series.js";
import { goldenEvents } from "./helpers/golden.js";
import { show, text, today, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const DAY = 86_400;
const X = [0, DAY, 2 * DAY];
const CORE: ChartSeries = { label: "Cartera", values: [10, null, 30], colour: "--c-series-core" };
const STEP: ChartSeries = {
  label: "Aportado",
  values: [5, 5, 8],
  colour: "--c-series-contrib",
  dash: [6, 4],
  step: true,
};

describe("the options of a chart in a stack", () => {
  it("carries the key of its group, so the cursors move together", () => {
    const options = chartOptions(
      { x: X, series: [CORE], width: 320, height: 200, sync: "evolution" },
      false,
    );
    expect(options.cursor?.sync?.key).toBe("evolution");
    expect(
      chartOptions({ x: X, series: [CORE], width: 320, height: 200 }, false).cursor?.sync,
    ).toBeUndefined();
  });

  it("draws the dates only where it is told to", () => {
    const axis = (dates?: boolean) =>
      chartOptions(
        {
          x: X,
          series: [CORE],
          width: 320,
          height: 200,
          ...(dates === undefined ? {} : { dates }),
        },
        false,
      ).axes?.[0];
    expect(axis(false)?.show).toBe(false);
    expect(axis(true)?.show).toBe(true);
    expect(axis()?.show).toBe(true);
  });

  it("gives a step series a path of its own, and the others the default", () => {
    const [, plain, stepped] = chartOptions(
      { x: X, series: [CORE, STEP], width: 320, height: 200 },
      false,
    ).series as { paths?: unknown }[];
    expect(plain?.paths).toBeUndefined();
    expect(typeof stepped?.paths).toBe("function");
  });

  it("shades the holes of the series it is told, not of the ones it draws", () => {
    // The step has no holes; alone it would shade nothing, and with the core
    // as the band the gap is the one of the core.
    const band = [{ ...CORE, values: [null, null, 30] }];
    const withBands = chartOptions(
      { x: X, series: [STEP], bands: band, width: 320, height: 200 },
      false,
    );
    const drawClear = (withBands.hooks?.drawClear ?? []) as unknown[];
    expect(drawClear).toHaveLength(1);
    expect(gapsOf(X, band)).toEqual([{ from: 0, to: 2 * DAY }]);
  });

  it("does not let a step series, which is never absent, hide a hole", () => {
    // The core has no value on the second date; the step has, but says nothing about holes.
    expect(gapsOf(X, [CORE, STEP])).toEqual([{ from: 0, to: 2 * DAY }]);
    expect(gapsOf(X, [{ ...CORE, values: [1, 2, 3] }, STEP])).toEqual([]);
  });
});

describe("what was contributed as one more series of the plot", () => {
  it("keeps the dates of the plot and adds a column of strings and a line of numbers", () => {
    const events = goldenEvents();
    const options = { to: "2027-01-31" };
    const contributed = contributedSeries(events, options);
    const plot = withContributed(
      {
        x: contributed.points.map((point) => secondsOf(point.date)),
        values: [[1], [2], [3]].map((one) => contributed.points.map(() => one[0] as number)),
        rows: contributed.points.map((point) => ({ date: point.date, values: ["1", "2", "3"] })),
        drawn: 1,
        total: 1,
      },
      contributed,
    );
    expect(plot.values).toHaveLength(4);
    expect(plot.rows.every((row) => row.values.length === 4)).toBe(true);
    expect(plot.values[3]?.every((value) => typeof value === "number")).toBe(true);
    expect(plot.rows[0]?.values[3]).toBe(contributed.points[0]?.contributed_eur.amount.toString());
    expect(netWorthPlot).toBeDefined();
  });
});

describe("the books with their cash against what was contributed", () => {
  it("draws 10.000 against 10.000 for a deposit of 10.000 and a purchase of 2.000", () => {
    let n = 0;
    const envelope = (type: string): Record<string, unknown> => ({
      schema_version: 1,
      id: `01ARYZ6S41TSV4RRFFQ6900${String(n++).padStart(3, "0")}`,
      recorded_at: "2027-01-05T18:00:00.000Z",
      type,
      fingerprint: `sha256:${type}${n}`,
    });
    const money = { currency: "EUR", fx_rate: "1" };
    const events = [
      {
        ...envelope("account_created"),
        account_id: "acc_es",
        name: "Cuenta",
        platform: "test",
        book: "core",
        base_currency: "EUR",
        country: "ES",
        active: true,
      },
      {
        ...envelope("asset_created"),
        asset_id: "ast_f",
        asset_type: "fund",
        book: "core",
        asset_class: "equity",
        name: "Fondo",
        currency: "EUR",
        transferable: true,
        active: true,
      },
      {
        ...envelope("cash_deposit"),
        account_id: "acc_es",
        value_date: "2027-01-04",
        amount: "10000",
        fx_rate_date: "2027-01-04",
        ...money,
      },
      {
        ...envelope("buy"),
        account_id: "acc_es",
        asset_id: "ast_f",
        trade_date: "2027-01-05",
        value_date: "2027-01-05",
        quantity: "10",
        unit_price: "200",
        fx_rate_date: "2027-01-05",
        fee: "0",
        source: "manual",
        ...money,
      },
      {
        ...envelope("valuation"),
        account_id: "acc_es",
        asset_id: "ast_f",
        date: "2027-01-31",
        quantity: "10",
        unit_value: "200",
        fx_rate_date: "2027-01-31",
        source: "manual",
        ...money,
      },
    ] as unknown as LedgerEvent[];
    const options = { to: "2027-01-31" };
    const plot = withContributed(
      withBookCash(netWorthPlot(netWorthSeries(events, options)), bookCashSeries(events, options)),
      contributedSeries(events, options),
    );
    // Not 2.000 (the assets alone) against 10.000: the cash is in the portfolio.
    expect(plot.values[0]).toEqual([10000]);
    expect(plot.values[2]).toEqual([10000]);
    expect(plot.rows[0]?.values).toEqual(["10000", "0", "10000"]);
    // Two books and what was contributed: no third line repeats the cash.
    expect(plot.values).toHaveLength(3);
  });
});

describe("the evolution of the summary", () => {
  it("is a stack of two charts, the bucket with its cash on its own scale", async () => {
    today("2027-01-10");
    const host = await show("/", Resumen);
    const card = host.querySelector(".summary-evolution");
    const charts = [...(card?.querySelectorAll(".chart-plot") ?? [])];
    expect(charts.map((chart) => chart.className)).toEqual([
      "chart-plot is-main",
      "chart-plot is-end",
    ]);
    const names = [...(card?.querySelectorAll(".panel-name") ?? [])].map(text);
    expect(names).toEqual(["Cubo escala propia"]);
    // The cash is no panel of its own: it goes with its book (ADR-0004).
    expect(text(card?.querySelector(".chart-legend"))).not.toMatch(/^Efectivo|· Efectivo/);
    expect(text(card?.querySelector(".chart-legend"))).toContain("Aportado");
  });

  it("puts what was contributed in the equivalent table, with its figures masked in private", async () => {
    today("2027-01-10");
    store.setPrivacy(true);
    const host = await show("/", Resumen);
    const table = host.querySelector(".summary-evolution table");
    expect(text(table?.querySelector("thead"))).toContain("Aportado");
    expect(text(table?.querySelector("tbody")).replace(/\d{2}\/\d{2}\/\d{4}/g, "")).not.toMatch(
      /\d/,
    );
  });

  it("labels each chart without any amount", async () => {
    today("2027-01-10");
    const host = await show("/", Resumen);
    const labels = [...host.querySelectorAll(".summary-evolution .chart-plot")].map((chart) =>
      chart.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "Evolución del patrimonio: cartera principal con su efectivo y lo aportado",
      "Evolución del patrimonio: Cubo",
    ]);
  });
});
