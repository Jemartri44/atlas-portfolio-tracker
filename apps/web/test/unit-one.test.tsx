// @vitest-environment happy-dom
//
// «1 participaciones» was on screen: a quantity of exactly one takes the
// singular. Only when the figure shows — under the mask the plural stays, or
// the unit would tell how much the four dots hide.

import { Quantity } from "@atlas/domain";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { Parts } from "../src/components/Parts.jsx";
import { store } from "../src/ledger/state.js";
import type { Part } from "../src/view-models/structured.js";

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  store.setPrivacy(false);
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
    store.setPrivacy(false);
    expect(said("1")).toBe("1 participación");
    expect(said("1.000")).toBe("1 participación");
    expect(said("1.5")).toBe("1,5 participaciones");
    expect(said("2")).toBe("2 participaciones");
  });

  it("keeps the plural under the mask, which would say it otherwise", () => {
    store.setPrivacy(true);
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
