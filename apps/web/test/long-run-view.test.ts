// What the Cartera reads from what the owner types for the long-run questions, and the sentence of
// whatever is missing.

import { EUR, Money } from "@atlas/domain";
import type { TotalCost } from "@atlas/domain/portfolio";
import { describe, expect, it } from "vitest";
import { missingSentence } from "../src/view-models/core/long-run.js";
import { emptyProjectionInputs, readProjection } from "../src/view-models/core/projection.js";
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
