// @vitest-environment happy-dom
//
// The tax line of a sale step says a loss as a positive figure after the word «pérdida»: «la
// pérdida de 90,00 €», never «la pérdida de -90,00 €».

import { Money, Quantity } from "@atlas/domain";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { Step } from "../src/routes/cartera/RebalanceSteps.jsx";
import { setPrivacy } from "../src/shell/preferences.js";
import type { SaleTaxView, StepView } from "../src/view-models/core/index.js";

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  setPrivacy(false);
});

const eur = (value: string): Money => Money.parse(value, "EUR");

const painted = (tax: SaleTaxView): string => {
  const step: StepView = {
    kind: "sale",
    index: 1,
    maxDeviationPp: "0",
    name: "World Index Fund",
    amount: eur("1000"),
    orders: [{ accountId: "acc_mi", quantity: Quantity.parse("10"), amount: eur("1000") }],
    tax,
    buys: { rows: [], note: undefined } as never,
  };
  setPrivacy(false);
  const host = document.createElement("div");
  disposers.push(render(() => <Step step={step} />, host));
  return (host.textContent ?? "").replace(/\s+/g, " ");
};

describe("the tax line of a sale", () => {
  it("says a loss that saves tax without a minus sign", () => {
    const said = painted({
      kind: "estimated",
      saving: eur("17.10"),
      gain: eur("-90"),
      isLoss: true,
      lots: [],
    });
    expect(said).toMatch(/la pérdida de 90,00.€ compensa/);
    expect(said).not.toContain("de -90");
    expect(said).not.toContain("de −90");
  });

  it("says a loss that pays no tax without a minus sign either", () => {
    const said = painted({
      kind: "estimated",
      tax: eur("0"),
      gain: eur("-125"),
      isLoss: true,
      lots: [],
    });
    expect(said).toMatch(/una pérdida de 125,00.€/);
    expect(said).not.toMatch(/pérdida de [-−]/);
  });

  it("leaves a gain as it is", () => {
    const said = painted({
      kind: "estimated",
      tax: eur("19"),
      gain: eur("100"),
      isLoss: false,
      lots: [],
    });
    expect(said).toMatch(/una ganancia de 100,00.€/);
  });
});
