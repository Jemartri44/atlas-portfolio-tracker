// @vitest-environment happy-dom
//
// M10 and the bucket side of M1 (feature 020, E3): the three gauges of the
// bucket and the dumbbell of each thesis. Every figure and every mark is the
// domain's or `Settings`'s; the screen places them. They are drawn from
// percentages, so they say the same with the privacy mode on.

import { NEAR_LIMIT_PCT } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { store } from "../src/ledger/state.js";
import Cubo from "../src/routes/cubo/index.jsx";
import {
  capShape,
  dumbbells,
  gaugesView,
  meterOf,
  resultShape,
  type ThesisRow,
  weightShape,
} from "../src/view-models/bucket/index.js";
import { show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

describe("where the marks and the fills of a gauge go", () => {
  it("places the contribution on an axis of 0 to 100, with the mark of the warning", () => {
    expect(capShape("40", "80")).toEqual({ from: 0, to: 40, mark: 80 });
  });

  it("stretches the axis when the cap is passed, and the mark moves back with it", () => {
    const over = capShape("125", "80");
    expect(over.to).toBe(100);
    expect(over.mark).toBe(64);
  });

  it("puts the result around a zero line, with the stop rule on the loss side", () => {
    // Axis ±32,55 for a +31 % result and a stop rule of 30 %.
    const shape = resultShape("31", "30");
    expect(shape.zero).toBe(50);
    expect(shape.dot).toBeCloseTo(50 + (31 / 32.55) * 50, 6);
    expect(shape.mark).toBeCloseTo(50 - (30 / 32.55) * 50, 6);
    // Without a rule there is no mark, and a loss goes to the left of zero.
    expect(resultShape("-5", undefined).mark).toBeUndefined();
    expect(resultShape("-5", undefined).dot).toBeLessThan(50);
  });

  it("moves the stop mark with the rule: it is Settings', not a number of the screen", () => {
    expect(resultShape("40", "25").mark).not.toBe(resultShape("40", "30").mark);
  });

  it("places the weight on an axis that reaches a bit past its maximum, or past the weight", () => {
    const shape = weightShape("6.5", "10");
    expect(shape.to).toBeCloseTo((6.5 / 15) * 100, 6);
    expect(shape.mark).toBeCloseTo((10 / 15) * 100, 6);
    // Past the maximum by a lot the axis follows the weight, and the mark stays inside.
    expect(weightShape("30", "10").to).toBeCloseTo((30 / 33) * 100, 6);
    // No maximum configured: no mark.
    expect(weightShape("6.5", undefined).mark).toBeUndefined();
  });

  it("brings the figures of the domain as decimal strings, and only those it has", () => {
    const view = gaugesView({
      near_limit_pct: NEAR_LIMIT_PCT,
    });
    expect(view).toEqual({ nearLimitPct: "80" });
  });
});

describe("what a gauge says of itself", () => {
  const bare = { nearLimitPct: "80" };

  it("is nothing where the domain could not measure it", () => {
    for (const key of ["cap", "result", "weight"] as const) {
      expect(meterOf(bare, key)).toBeUndefined();
    }
  });

  it("has no mark, and says no rule, where there is no rule configured", () => {
    const result = meterOf({ ...bare, resultPct: "-4" }, "result");
    expect(result?.mark).toBeUndefined();
    expect(result?.aria).toBe("Resultado de −4\u00a0% sobre lo aportado");
    const weight = meterOf({ ...bare, weightPct: "6.5" }, "weight");
    expect(weight?.mark).toBeUndefined();
    expect(weight?.both).toBe(true);
    expect(meterOf({ ...bare, contributionPctOfCap: "40" }, "cap")?.both).toBe(false);
  });
});

const thesis = (id: string, pct: string | undefined, index: string | undefined): ThesisRow =>
  ({
    thesisId: id,
    assetName: `Asset ${id}`,
    period: "abierta",
    ...(pct === undefined ? {} : { thesisPct: pct, indexPct: index, vsIndexPp: "1" }),
  }) as ThesisRow;

describe("the axis of the dumbbells", () => {
  it("is one for every thesis, with the 0 % inside it", () => {
    const { rows, zero } = dumbbells([thesis("a", "12.4", "9.8"), thesis("b", "-8.1", "2.3")]);
    expect(rows).toHaveLength(2);
    expect(zero).toBeGreaterThan(0);
    expect(zero).toBeLessThan(100);
    // The lower thesis is to the left of zero and the index ring of the other to its right.
    expect(rows[1]?.dot).toBeLessThan(zero);
    expect(rows[0]?.dot).toBeGreaterThan(zero);
  });

  it("does not draw a thesis that cannot be compared", () => {
    const { rows } = dumbbells([thesis("a", "12.4", "9.8"), thesis("b", undefined, undefined)]);
    expect(rows.map((row) => row.thesisId)).toEqual(["a"]);
  });

  it("has nothing, and a zero in the middle, when there is nothing to compare", () => {
    expect(dumbbells([]).rows).toEqual([]);
  });
});

const meters = (host: HTMLElement): Element[] => [...host.querySelectorAll(".meter")];

describe("the gauges of the bucket on the screen, with the privacy mode on", () => {
  it("draws the three, each with its figure in percent", async () => {
    store.setPrivacy(true);
    const host = await show("/cubo?fecha=2027-01-10", Cubo);
    const labels = meters(host).map((meter) => text(meter.querySelector(".meter-label")));
    expect(labels).toEqual([
      "Aportado frente al tope33,33 %",
      "Resultado sobre lo aportado+23,88 %",
      "Peso del cubo en tu patrimonio5,93 %",
    ]);
  });

  it("says what each means to a reader of the page, with no amount in the label", async () => {
    store.setPrivacy(true);
    const host = await show("/cubo?fecha=2027-01-10", Cubo);
    const aria = meters(host).map((meter) =>
      meter.querySelector("svg")?.getAttribute("aria-label"),
    );
    expect(aria[0]).toMatch(/^Aportado el 33,33\s%.* del tope; aviso al 80\s%$/);
    expect(aria[1]).toMatch(
      /^Resultado de \+23,88\s%.* sobre lo aportado; la regla de parada salta en −30\s%$/,
    );
    expect(aria[2]).toMatch(/^El cubo pesa el 5,93\s%.* del patrimonio; máximo 10\s%$/);
  });

  it("draws the mark of the warning where the domain puts it: NEAR_LIMIT_PCT", async () => {
    const host = await show("/cubo?fecha=2027-01-10", Cubo);
    const mark = meters(host)[0]?.querySelector("line.warn");
    expect(mark?.getAttribute("x1")).toBe(`${NEAR_LIMIT_PCT.toString()}%`);
  });

  it("takes the stop rule and the maximum weight from the settings", async () => {
    const host = await show("/cubo?fecha=2027-01-10", Cubo);
    expect(text(meters(host)[1]?.querySelector("text"))).toBe("parada −30 %");
    expect(text(meters(host)[2]?.querySelector("text"))).toBe("máx. 10 %");
  });

  it("fills past the mark exactly when the domain warns of the cap", async () => {
    for (const [date, warned] of [
      ["2027-01-10", false],
      ["2029-01-10", true],
    ] as const) {
      const host = await show(`/cubo?fecha=${date}`, Cubo);
      const bar = meters(host)[0];
      const fill = Number.parseFloat(bar?.querySelector("rect.fill")?.getAttribute("width") ?? "");
      const mark = Number.parseFloat(bar?.querySelector("line.warn")?.getAttribute("x1") ?? "");
      expect(fill > mark).toBe(warned);
      const notice = host.querySelector('[aria-label="Avisos del presupuesto"]');
      expect(notice !== null).toBe(warned);
      document.body.innerHTML = "";
    }
  });

  it("marks the weight as the one figure that adds both books, with its accent rule and its phrase", async () => {
    const host = await show("/cubo?fecha=2027-01-10", Cubo);
    const weight = host.querySelector(".meter.both");
    expect(weight).not.toBeNull();
    expect(text(weight?.querySelector(".meter-note"))).toBe(
      "La única cifra que junta el cubo y la cartera principal.",
    );
    expect(host.querySelectorAll(".meter.both")).toHaveLength(1);
  });

  it("draws no gauge it cannot measure, and says so instead", async () => {
    // 15/01/2029: a position has no price, so neither the result nor the weight can be measured.
    const host = await show("/cubo?fecha=2029-01-15", Cubo);
    expect(meters(host).map((meter) => text(meter.querySelector(".meter-label")))).toEqual([
      "Aportado frente al tope83,33 %",
    ]);
    expect(text(host)).toContain("no evaluada");
  });
});

describe("the dumbbells of the theses, with the privacy mode on", () => {
  it("draws the dot of the thesis and the ring of the index, in different shapes", async () => {
    store.setPrivacy(true);
    const host = await show("/cubo?fecha=2027-01-10", Cubo);
    const rows = [...host.querySelectorAll(".dumb > li")];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const dot = row.querySelector("circle.dot");
      const ring = row.querySelector("circle.ring");
      expect(dot?.getAttribute("r")).not.toBe(ring?.getAttribute("r"));
      expect(row.querySelector("line.grid")).not.toBeNull();
    }
  });

  it("writes the difference in points in ink, with its sign", async () => {
    store.setPrivacy(true);
    const host = await show("/cubo?fecha=2027-01-10", Cubo);
    for (const figure of host.querySelectorAll(".dumb .vs")) {
      expect(text(figure)).toMatch(/^[+−-]\d[\d.]*,\d\spp$/);
      expect(figure.classList.contains("positive")).toBe(false);
      expect(figure.classList.contains("negative")).toBe(false);
    }
  });

  it("does not draw a thesis that cannot be compared", async () => {
    // 15/01/2029: one thesis has no index price, and the card says it is not compared.
    const host = await show("/cubo?fecha=2029-01-15", Cubo);
    const drawn = host.querySelectorAll(".dumb > li").length;
    const listed = host.querySelectorAll(
      'table[aria-label="Tesis abiertas"] tbody tr, table[aria-label="Tesis cerradas"] tbody tr, table[aria-label="Tesis del cubo"] tbody tr',
    ).length;
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(listed);
  });
});

describe("a percentage over a partial total", () => {
  it("is «sin dato» where the thesis has no comparison, never a zero or an estimate", async () => {
    // 15/01/2029: one thesis has no index price, so its two percentages are missing.
    store.setPrivacy(true);
    const host = await show("/cubo?fecha=2029-01-15", Cubo);
    const cells = [
      ...host.querySelectorAll(
        'table[aria-label^="Tesis"] tbody tr td:nth-last-child(2), table[aria-label^="Tesis"] tbody tr td:nth-last-child(3)',
      ),
    ].map((cell) => text(cell));
    expect(cells).toContain("sin dato");
    expect(cells.filter((cell) => cell !== "sin dato").every((cell) => /%|pp/.test(cell))).toBe(
      true,
    );
  });

  it("is not given to the weight of a position while the bucket total is partial", async () => {
    store.setPrivacy(true);
    const host = await show("/cubo?fecha=2029-01-15", Cubo);
    const weights = [
      ...host.querySelectorAll('table[aria-label="Posiciones del cubo"] tbody td.num'),
    ].map((cell) => text(cell));
    expect(weights).toContain("sin dato");
  });
});

describe("what the cards of E3 say with the privacy mode on", () => {
  const counts = (card: Element | undefined): { masks: number; percentages: number } => {
    // The phone presentation: the table of the wide one says the same thing again.
    const clone = card?.cloneNode(true) as Element;
    for (const node of clone.querySelectorAll(".only-wide")) {
      node.remove();
    }
    return {
      masks: clone.querySelectorAll(".mask").length,
      percentages: text(clone).match(/\d(?:[\d.]*,\d+)?\s?(?:%|pp)/g)?.length ?? 0,
    };
  };
  const cardOf = (host: HTMLElement, title: string): Element | undefined =>
    [...host.querySelectorAll("section.card")].find(
      (card) => text(card.querySelector("h2")) === title,
    );

  it("has at least as many percentages as masks in the budget, and more in the theses", async () => {
    // The page as a whole closes with M7 (E4), which turns the chart table into percentages.
    store.setPrivacy(true);
    const host = await show("/cubo?fecha=2027-01-10", Cubo);
    const budget = counts(cardOf(host, "Presupuesto y control"));
    expect(budget.percentages).toBeGreaterThanOrEqual(budget.masks);
    const theses = counts(cardOf(host, "Tesis frente al índice"));
    expect(theses.percentages).toBeGreaterThan(theses.masks);
  });
});
