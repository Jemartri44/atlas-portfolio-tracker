// @vitest-environment happy-dom
//
// The summary of direction A: the month's tasks, the return of the core and the small lines of
// the tiles, on the golden ledger. What it says comes from the domain (`monthPlan`, `coreReturn`);
// here, that the screen shows it, hides the amounts with the privacy on and cuts a line at a hole.

import { Money, type NetWorth, type NetWorthSeries } from "@atlas/domain";
import { afterEach, describe, expect, it } from "vitest";
import { chartOptions, washOf } from "../src/components/chart/options.js";
import { sparkRuns } from "../src/components/chart/Sparkline.jsx";
import { bookLines } from "../src/routes/resumen/book-lines.js";
import Resumen from "../src/routes/resumen/index.jsx";
import { setPrivacy } from "../src/shell/preferences.js";
import { show, text, today, until, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();
afterEach(() => setPrivacy(true));

const AMOUNT = /\d[\d.]*(,\d+)? €/;

const month = async (): Promise<HTMLElement> => {
  today("2029-01-20");
  const host = await show("/", Resumen);
  await until(() => host.querySelector(".summary-month .tasks") !== null, "el plan del mes");
  return host;
};

describe("Este mes", () => {
  it("lists the deposit, the assets of the plan and the bucket, each pending or done", async () => {
    const card = (await month()).querySelector(".summary-month");
    expect(text(card)).toContain("Ingreso de efectivo");
    expect(text(card)).toContain("Cubo · presupuesto del mes");
    expect(card?.querySelectorAll(".task").length).toBeGreaterThanOrEqual(3);
    expect(text(card)).toMatch(/pendiente|registrado/);
  });

  it("hides every amount with the privacy on and shows them with it off", async () => {
    setPrivacy(true);
    expect(text((await month()).querySelector(".summary-month"))).not.toMatch(AMOUNT);
    setPrivacy(false);
    expect(text((await month()).querySelector(".summary-month"))).toMatch(AMOUNT);
  });
});

describe("the return of the core", () => {
  it("says this month and twelve months with a figure or the reason, never a made-up zero", async () => {
    const host = await month();
    await until(() => !text(host.querySelector(".hero-deltas")).includes("…"), "la variación");
    expect(text(host.querySelector(".hero-deltas"))).toMatch(
      /este mes (?:[+−-]?\d+,\d %|sin dato|menos de)/,
    );
    expect(text(host.querySelector(".hero-deltas"))).toMatch(
      /12 meses (?:[+−-]?\d+,\d %|sin dato|menos de)/,
    );
  });
});

describe("the small line of a tile", () => {
  it("cuts the line at a hole and keeps a lone value as a dot", () => {
    const runs = sparkRuns([1, 2, null, 3, null, 4, 5]);
    expect(runs.map((run) => run.length)).toEqual([2, 1, 2]);
  });

  it("draws nothing without a single value", () => {
    expect(sparkRuns([null, null])).toEqual([]);
  });
});

describe("the areas of the evolution", () => {
  const x = [1, 2, 3];
  const core = {
    label: "Cartera",
    values: [10, null, 12],
    colour: "--c-series-core",
    fill: "zero" as const,
  };
  const stack = {
    label: "Pila",
    values: [11, null, 14],
    colour: "--c-series-bucket",
    fill: { below: "Cartera" },
  };

  it("fills the core down to zero and the stack only between the two lines", () => {
    const options = chartOptions({ x, series: [core, stack], width: 300, height: 200 }, false);
    expect(options.series?.[1]?.fill).toBeDefined();
    expect(options.series?.[2]?.fill).toBeUndefined();
    expect(options.bands).toEqual([{ series: [2, 1], fill: expect.any(String) }]);
  });

  it("washes a token colour, and leaves anything else as it is", () => {
    expect(washOf("#4166b4", 0.16)).toBe("rgba(65, 102, 180, 0.16)");
    expect(washOf("red", 0.16)).toBe("red");
  });
});

describe("the small lines of the tiles", () => {
  it("draw the last year of each book's own value and keep its holes", () => {
    const eur = (value: string) => Money.parse(value, "EUR");
    const series = {
      from: "2027-01-01",
      to: "2028-01-01",
      complete: 1,
      points: [
        { date: "2026-12-31", core_eur: eur("1"), missing: { core: [], bucket: [], cash: [] } },
        { date: "2027-06-30", missing: { core: ["a"], bucket: [], cash: [] }, cash_eur: eur("5") },
        {
          date: "2028-01-01",
          core_eur: eur("3"),
          cash_eur: eur("6"),
          missing: { core: [], bucket: [], cash: [] },
        },
      ],
    } as unknown as NetWorthSeries;
    const worth = {
      cash: {
        rows: [
          { account_id: "a", balance: eur("5") },
          { account_id: "a", balance: eur("1") },
          { account_id: "b", balance: eur("0") },
        ],
      },
    } as unknown as NetWorth;
    const lines = bookLines(series, worth, "2027-01-20");
    expect(lines.spark.core).toEqual([null, 3]);
    expect(lines.spark.cash).toEqual([5, 6]);
    expect(lines.cashAccounts).toBe(1);
  });
});

describe("a return without a figure", () => {
  it("says why on a partial core instead of a zero", async () => {
    today("2026-09-18");
    const host = await show("/", Resumen);
    await until(() => !text(host.querySelector(".hero-deltas")).includes("…"), "la variación");
    expect(text(host.querySelector(".hero-deltas"))).toMatch(/este mes (sin dato|menos de)/);
    expect(text(host.querySelector(".hero-deltas"))).not.toMatch(/0,0 %/);
  });
});
