// @vitest-environment happy-dom
//
// The summary of direction A: the month's tasks, the return of the core and the small lines of
// the tiles, on the golden ledger. What it says comes from the domain (`monthPlan`, `coreReturn`);
// here, that the screen shows it, hides the amounts with the privacy on and cuts a line at a hole.

import { afterEach, describe, expect, it } from "vitest";
import { sparkRuns } from "../src/components/chart/Sparkline.jsx";
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
