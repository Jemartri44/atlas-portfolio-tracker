// @vitest-environment happy-dom
//
// The anchor of what was filed, painted: origin by origin, and saying so when
// it matches what the engine computed (review of feature 011).

import { Money } from "@atlas/domain";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { store } from "../src/ledger/state.js";
import { LossesCard } from "../src/routes/fiscal/LossesCard.jsx";
import type { AnchorView } from "../src/view-models/fiscal/index.js";

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  store.setPrivacy(false);
});

const eur = (value: string): Money => Money.parse(value, "EUR");

const painted = (anchors: AnchorView[]): string => {
  const host = document.createElement("div");
  disposers.push(
    render(
      () => <LossesCard year={2029} pending={[]} expired={[]} expiring={[]} anchors={anchors} />,
      host,
    ),
  );
  return (host.textContent ?? "").replace(/\s+/g, " ");
};

const anchor = (overrides: Partial<AnchorView> = {}): AnchorView => ({
  key: "2028",
  year: 2028,
  rows: [
    {
      key: "2027|capital_gain",
      origin_year: 2027,
      category: "capital_gain",
      computed_eur: eur("-300"),
      declared_eur: eur("-100"),
    },
    {
      key: "2028|capital_gain",
      origin_year: 2028,
      category: "capital_gain",
      computed_eur: eur("0"),
      declared_eur: eur("-200"),
    },
  ],
  matches: false,
  before_ledger: false,
  ...overrides,
});

describe("the anchor of what was filed, painted", () => {
  it("names each origin with what it computed and what was declared", () => {
    store.setPrivacy(false);
    const shown = painted([anchor()]);
    expect(shown).toContain("Pérdidas patrimoniales de 2027");
    expect(shown).toContain("Pérdidas patrimoniales de 2028");
    expect(shown).toContain("no de lo que calcula la aplicación");
    expect(shown).toMatch(/calculaba −300,00\s*€, declaraste −100,00\s*€/);
  });

  it("says it matches, and does not dress an agreement up as a difference", () => {
    store.setPrivacy(false);
    const same = anchor({
      matches: true,
      rows: [
        {
          key: "2027|capital_gain",
          origin_year: 2027,
          category: "capital_gain",
          computed_eur: eur("-300"),
          declared_eur: eur("-300"),
        },
      ],
    });
    const shown = painted([same]);
    expect(shown).toContain("coincide con lo calculado");
    expect(shown).not.toContain("calculaba");
  });

  it("keeps the fact and the origins under the mask, never the amounts", () => {
    store.setPrivacy(true);
    const shown = painted([anchor()]);
    expect(shown).toContain("Anclado en lo que declaraste en 2028");
    expect(shown).toContain("de 2027");
    expect(shown).not.toMatch(/\d+,\d{2}\s*€/);
  });
});
