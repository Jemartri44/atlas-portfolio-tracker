// @vitest-environment happy-dom
//
// «1 participaciones» was on screen: a quantity of exactly one takes the
// singular. Only when the figure shows — under the mask the plural stays, or
// the unit would tell how much the four dots hide.

import { Quantity } from "@atlas/domain";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { Parts } from "../src/components/Parts.jsx";
import { setPrivacy } from "../src/shell/preferences.js";
import { effectSentences, type Part } from "../src/view-models/structured.js";

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  setPrivacy(false);
});

const said = (quantity: string): string => {
  const host = document.createElement("div");
  const parts: Part[] = [
    { quantity: Quantity.parse(quantity), of: "participaciones", one: "participación" },
  ];
  disposers.push(render(() => <Parts parts={parts} />, host));
  return (host.textContent ?? "").replace(/\s/g, " ");
};

describe("a quantity in a sentence", () => {
  it("takes the singular for exactly one", () => {
    setPrivacy(false);
    expect(said("1")).toBe("1 participación");
    expect(said("1.000")).toBe("1 participación");
    expect(said("1.5")).toBe("1,5 participaciones");
    expect(said("2")).toBe("2 participaciones");
  });

  it("keeps the plural under the mask, which would say it otherwise", () => {
    setPrivacy(true);
    expect(said("1")).toContain("participaciones");
    expect(said("1")).not.toContain("participación");
  });
});

describe("a number of securities in a message", () => {
  it("takes the singular for one, and keeps the plural under the mask", async () => {
    const { figuresOf } = await import("../src/format/privacy.js");
    expect(figuresOf(false).titles("1")).toBe("1 título");
    expect(figuresOf(false).titles("3")).toBe("3 títulos");
    expect(figuresOf(false).titles("1.5")).toBe("1,5 títulos");
    expect(figuresOf(true).titles("1")).toMatch(/^•+ títulos$/);
  });
});

describe("the effect of a return of capital", () => {
  it("says what each account received and that the cost goes down, not a sale", () => {
    const host = document.createElement("div");
    const [parts] = effectSentences(
      [
        {
          op: "cost_adjustment",
          per_account: [{ account_id: "acc_a", amount: "60" }],
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-06-01",
        },
      ],
      "ast_s",
      { acc_a: "Cuenta A", ast_s: "Acción S" },
    );
    disposers.push(render(() => <Parts parts={parts as Part[]} />, host));
    const text = (host.textContent ?? "").replace(/\s/g, " ");
    expect(text).toContain("Cuenta A");
    expect(text).toContain("rebajan el coste de los lotes de Acción S, sin vender nada");
    expect(text).not.toContain("no sabe describir");
  });
});
