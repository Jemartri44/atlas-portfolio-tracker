// The assumptions as typed and the result as the screen says it. The figures are the domain's.

import { Decimal, EUR, Money } from "@atlas/domain";
import type { ProjectionCases, ProjectionDiscounts } from "@atlas/domain/portfolio";
import { describe, expect, it } from "vitest";
import { bucketPartView } from "../src/view-models/core/index.js";
import { inputsOf, projectionView, readProjection } from "../src/view-models/core/projection.js";

const monthly = Decimal.parse("540");
const eur = (text: string): Money => Money.parse(text, EUR);
const start = () => inputsOf({}, monthly);

describe("readProjection", () => {
  it("writes the figures of the start in Spanish and reads them as no edit", () => {
    const inputs = start();
    expect(inputs["equity.volatility_pct"]).toBe("15,52");
    expect(inputs.monthly_eur).toBe("540");
    expect(inputs.commission_pct).toBe("");
    expect(readProjection(inputs, monthly)).toEqual({ edits: {}, errors: {} });
  });

  it("keeps only what differs from the start, and an edit comes back as typed", () => {
    const typed = {
      ...start(),
      years: "30",
      "gold.return_pct": "4,5",
      commission_pct: "0,1",
    };
    const { edits } = readProjection(typed, monthly);
    expect(edits).toEqual({
      years: 30,
      commission_pct: "0.1",
      classes: { gold: { return_pct: "4.5" } },
    });
    expect(inputsOf(edits ?? {}, monthly)["gold.return_pct"]).toBe("4,5");
  });

  it("reads an emptied field as the start", () => {
    expect(readProjection({ ...start(), "equity.return_pct": " " }, monthly).edits).toEqual({});
  });

  it.each([
    ["years", "veinte"],
    ["years", "0"],
    ["years", "101"],
    ["inflation_pct", "dos"],
    ["equity.volatility_pct", "-1"],
    ["commission_pct", "101"],
  ])("says what is wrong with %s = %s, and gives no edits", (field, raw) => {
    const read = readProjection({ ...start(), [field]: raw }, monthly);
    expect(read.edits).toBeUndefined();
    expect(read.errors[field]).toBeDefined();
  });
});

const ALL: ProjectionDiscounts = { inflation: true, taxes: true, fees: true };
const end = {
  value_eur: eur("100"),
  gross_eur: eur("120"),
  fees_eur: eur("5"),
  tax_eur: eur("15"),
};
const result = (patch: Partial<ProjectionCases>): ProjectionCases => ({
  years: 1,
  missing: [],
  monthly_core_eur: eur("10"),
  start_eur: eur("50"),
  ter_pct: Decimal.parse("0.12"),
  ter_partial: false,
  ter_missing_eur: eur("0"),
  points: [
    {
      year: 0,
      low_eur: eur("50"),
      normal_eur: eur("50"),
      high_eur: eur("50"),
      contributed_eur: eur("50"),
    },
  ],
  ends: { low: end, normal: end, high: end },
  ...patch,
});

describe("projectionView", () => {
  it("says everything that is discounted, the commission only when there is one", () => {
    expect(projectionView(result({}), "2029-05-10", ALL).discounted).toBe(
      "Descontado: inflación, impuestos al vender (escala del ahorro) y TER 0,12 %. Es una estimación informativa.",
    );
    expect(
      projectionView(result({ missing: ["commission"] }), "2029-05-10", ALL).discounted,
    ).toContain("y TER 0,12 %.");
  });

  it("says nothing is discounted with every box off", () => {
    const none = { inflation: false, taxes: false, fees: false };
    expect(projectionView(result({}), "2029-05-10", none).discounted).toBe("Sin descontar nada.");
  });

  it("names the three cases and what declares no TER", () => {
    const view = projectionView(
      result({ ter_partial: true, ter_missing_eur: eur("7") }),
      "2029-05-10",
      ALL,
    );
    expect(view.cases.map((one) => one.label)).toEqual(["Pesimista", "Normal", "Optimista"]);
    expect(view.terMissing?.amount.toString()).toBe("7");
  });

  it("gives the reason instead of a figure without a price", () => {
    const { ends: _none, ...rest } = result({ gap: "partial", points: [] });
    const view = projectionView(rest, "2029-05-10", ALL);
    expect(view.gap).toBe("falta un precio de la cartera principal");
    expect(view.cases).toEqual([]);
    expect(view.plot).toBeUndefined();
  });
});

describe("bucketPartView", () => {
  const controls = {
    contribution_gross_eur: eur("5000"),
    budget_eur: eur("1980"),
  } as Parameters<typeof bucketPartView>[2];
  const settings = {
    bucket_pct_of_contribution: "10",
    bucket_max_cumulative_contribution: "6000",
  } as Parameters<typeof bucketPartView>[1];

  it("reserves its share of the whole and says how its budget goes", () => {
    const part = bucketPartView("540", settings, controls);
    expect(part.share?.amount.toString()).toBe("60");
    expect(part.budget?.amount.toString()).toBe("1980");
    expect(part.room?.amount.toString()).toBe("1000");
  });

  it("has no share without new money, and no room below zero", () => {
    const over = { ...settings, bucket_max_cumulative_contribution: "4000" };
    const part = bucketPartView(undefined, over, controls);
    expect(part.share).toBeUndefined();
    expect(part.room?.amount.toString()).toBe("0");
  });
});
