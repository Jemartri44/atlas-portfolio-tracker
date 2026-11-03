// What the Cartera reads from what the owner types for the long-run questions, and the sentence of
// whatever is missing.

import { describe, expect, it } from "vitest";
import {
  emptyCostInputs,
  emptyProjectionInputs,
  missingSentence,
  readCost,
  readProjection,
} from "../src/view-models/core/long-run.js";

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
