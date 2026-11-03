// What the Cartera reads from what the owner types for the long-run questions, and the sentence of
// whatever is missing.

import { Decimal, EUR, Money } from "@atlas/domain";
import type { Projection, TotalCost } from "@atlas/domain/portfolio";
import { describe, expect, it } from "vitest";
import { missingSentence } from "../src/view-models/core/long-run.js";
import {
  emptyProjectionInputs,
  projectionView,
  readProjection,
} from "../src/view-models/core/projection.js";
import { emptyCostInputs, readCost, totalCostView } from "../src/view-models/core/total-cost.js";

describe("readProjection", () => {
  it("reads a Spanish keyboard and names an unnamed scenario", () => {
    const read = readProjection({
      years: "20",
      goal: "100000",
      scenarios: [{ name: " ", returns: { equity: "7,5", gold: "" } }],
    });
    expect(read.assumptions?.years).toBe(20);
    expect(read.assumptions?.scenarios[0]?.name).toBe("Escenario 1");
    expect(Object.keys(read.assumptions?.scenarios[0]?.returnsPct ?? {})).toEqual(["equity"]);
    expect(read.assumptions?.goalEur?.toString()).toBe("100000");
  });

  it("gives no assumptions while any field does not read, and says which", () => {
    const read = readProjection({
      years: "x",
      goal: "-5",
      scenarios: [{ name: "a", returns: { equity: "abc" } }],
    });
    expect(read.assumptions).toBeUndefined();
    expect(read.years).toBeDefined();
    expect(read.goal).toBe("El objetivo tiene que ser mayor que cero.");
    expect(read.returns["0:equity"]).toBeDefined();
  });

  it.each(["0", "101"])("refuses a horizon of %s years", (years) => {
    const read = readProjection({ ...emptyProjectionInputs(), years });
    expect(read.assumptions).toBeUndefined();
    expect(read.years).toBe("Entre 1 y 100 años.");
  });

  it("starts with one scenario and the default horizon", () => {
    const inputs = emptyProjectionInputs();
    expect(inputs.years).toBe("20");
    expect(readProjection(inputs).assumptions?.scenarios).toHaveLength(1);
  });
});

describe("readCost", () => {
  it("needs the gross return and leaves the optional costs out when empty", () => {
    expect(readCost(emptyCostInputs()).assumptions).toBeUndefined();
    const read = readCost({ years: "10", grossReturn: "5", commission: "", exitTax: "19" });
    expect(read.assumptions?.years).toBe(10);
    expect(read.assumptions?.commissionPct).toBeUndefined();
    expect(read.assumptions?.exitTaxPct?.toString()).toBe("19");
  });

  it("reads a Spanish decimal comma and keeps a negative gross return as a scenario", () => {
    const read = readCost({ ...emptyCostInputs(), grossReturn: "-2,5" });
    expect(read.assumptions?.grossReturnPct.toString()).toBe("-2.5");
  });

  it.each(["0", "101", "99999"])("refuses a horizon of %s years", (years) => {
    const read = readCost({ ...emptyCostInputs(), grossReturn: "5", years });
    expect(read.assumptions).toBeUndefined();
    expect(read.errors.years).toBe("Entre 1 y 100 años.");
  });

  it.each([
    ["commission", { commission: "-1" }],
    ["exitTax", { exitTax: "-2" }],
    ["grossReturn", { grossReturn: "5,x" }],
    ["years", { years: "1,5" }],
  ] as const)("refuses a wrong %s", (key, patch) => {
    const read = readCost({ ...emptyCostInputs(), grossReturn: "5", ...patch });
    expect(read.assumptions).toBeUndefined();
    expect(read.errors[key]).toBeDefined();
  });
});

describe("missingSentence", () => {
  it("is silent when nothing is missing and sends the settings to Configuración", () => {
    expect(missingSentence([])).toBeUndefined();
    expect(missingSentence(["monthly_contribution", "exit_tax"])).toBe(
      "Falta la aportación mensual y el tipo de salida en Configuración.",
    );
    expect(missingSentence(["commission"])).toBe("Falta la comisión por aportación.");
  });
});

describe("totalCostView", () => {
  const eur = (text: string): Money => Money.parse(text, EUR);
  const result = (patch: Partial<TotalCost>): TotalCost => ({
    years: 20,
    missing: [],
    ter_partial: false,
    ter_missing_eur: eur("0"),
    monthly_core_eur: eur("500"),
    end_without_costs_eur: eur("100000"),
    end_net_eur: eur("98000"),
    ter_cost_eur: eur("1000"),
    total_eur: eur("2000"),
    ...patch,
  });

  it("shows the figures when nothing blocks them", () => {
    const view = totalCostView(result({}));
    expect(view.gap).toBeUndefined();
    expect(view.total).toEqual(eur("2000"));
  });

  it("says what is missing instead of showing a total that counts the contribution as zero", () => {
    const view = totalCostView(result({ missing: ["monthly_contribution", "bucket_pct"] }));
    expect(view.gap).toBe("falta la aportación mensual y el porcentaje del cubo en Configuración");
  });

  it("adds the missing contribution to the reason of the domain, and keeps what only trims the total", () => {
    const both = totalCostView(result({ gap: "partial", missing: ["bucket_pct"] }));
    expect(both.gap).toBe(
      "falta un precio de la cartera principal; falta el porcentaje del cubo en Configuración",
    );
    const optional = totalCostView(result({ missing: ["commission", "exit_tax"] }));
    expect(optional.gap).toBeUndefined();
    expect(optional.missing).toBe("Falta la comisión por aportación y el tipo de salida.");
  });

  it("says how much priced value has no TER", () => {
    expect(
      totalCostView(result({ ter_partial: true, ter_missing_eur: eur("300") })).terMissing,
    ).toEqual(eur("300"));
  });
});

describe("projectionView", () => {
  const eur = (text: string): Money => Money.parse(text, EUR);
  const result = (patch: Partial<Projection>): Projection => ({
    years: 20,
    missing: [],
    monthly_core_eur: eur("540"),
    target_total_pct: Decimal.parse("100"),
    start_eur: eur("14000"),
    scenarios: [],
    ...patch,
  });

  it("says everything that is missing when the settings do not give the contribution", () => {
    const view = projectionView(
      result({ gap: "missing_settings", missing: ["monthly_contribution", "bucket_pct"] }),
      false,
    );
    expect(view.gap).toBe("falta la aportación mensual y el porcentaje del cubo en Configuración");
  });

  it("says how much the target weights add up to, and what else is missing", () => {
    const view = projectionView(
      result({
        gap: "targets_not_100",
        target_total_pct: Decimal.parse("95.5"),
        missing: ["bucket_pct"],
      }),
      false,
    );
    expect(view.gap).toBe(
      "los pesos objetivo suman 95,5 y tienen que sumar 100; falta el porcentaje del cubo en Configuración",
    );
  });

  it.each([
    ["partial", "falta un precio de la cartera principal"],
    ["no_targets", "no hay pesos objetivo en Configuración"],
  ] as const)("says why with the gap %s", (gap, sentence) => {
    expect(projectionView(result({ gap }), false).gap).toBe(sentence);
  });

  const reached = (goal_month: number | undefined) =>
    projectionView(
      result({
        scenarios: [
          {
            name: "A",
            missing_returns: [],
            blended_return_pct: Decimal.parse("5"),
            points: [
              { year: 0, value_eur: eur("14000"), contributed_eur: eur("14000") },
              { year: 20, value_eur: eur("300000"), contributed_eur: eur("144000") },
            ],
            ...(goal_month === undefined ? {} : { goal_month }),
          },
        ],
      }),
      true,
    ).scenarios[0];

  it("gives the end and what was contributed, and when the goal is reached, now or never", () => {
    expect(reached(undefined)?.end).toEqual(eur("300000"));
    expect(reached(undefined)?.contributed).toEqual(eur("144000"));
    expect(reached(undefined)?.goal).toBe("never");
    expect(reached(0)?.goal).toBe("now");
    expect(reached(87)?.goal).toBe(87);
  });

  it("names the classes whose return is missing and shows no figure for that scenario", () => {
    const only = projectionView(
      result({ scenarios: [{ name: "A", missing_returns: ["equity", "gold"] }] }),
      true,
    ).scenarios[0];
    expect(only?.missingReturns).toEqual(["Renta variable", "Oro"]);
    expect(only?.end).toBeUndefined();
    expect(only?.goal).toBeUndefined();
  });
});
