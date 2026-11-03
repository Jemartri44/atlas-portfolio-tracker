// What the Cartera reads from what the owner types for the long-run questions, and the sentence of
// whatever is missing.

import { describe, expect, it } from "vitest";
import { missingSentence } from "../src/view-models/core/long-run.js";
import { emptyCostInputs, readCost } from "../src/view-models/core/total-cost.js";

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
