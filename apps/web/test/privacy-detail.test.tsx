// @vitest-environment happy-dom
//
// The privacy mode on the detail and on the correction of a movement. Both
// printed what the ledger says without going through `Amount`: the effects of
// a corporate action and a configuration as raw JSON, and the correction card
// as `String(value)`. A test over a formatting function would not have seen
// it: the leak was in the call, so the screen is what is rendered here.

import { ledgerEntries, projectLedger } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { MASK } from "../src/format/money.js";
import { nameIndex } from "../src/format/names.js";
import { store } from "../src/ledger/state.js";
import Detail from "../src/routes/movimientos/detail.jsx";
import Edit from "../src/routes/movimientos/edit.jsx";
import { detailView } from "../src/view-models/detail.js";
import { goldenEvents } from "./helpers/golden.js";
import { DECIMAL, figuresLeft, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

/** The reverse split of the golden ledger: a forced sale of fractions in two accounts. */
const REVERSE_SPLIT = "01MQTWHB78RC2FADH9B774BHS5";
/** A purchase of the golden ledger: 31,2343 units of Money Market Fund for 3.100 EUR. */
const PURCHASE = "01M1PS7N80HK088D7010QSGMEQ";
/** A configuration change: 600 EUR a month, a cap of 6.000 EUR on the bucket. */
const SETTINGS = "01NDYZTZ804AP696WA0PA725XK";

describe("the detail and the correction of a movement, with the mask on and off", () => {
  it("tells the effects of a corporate action as sentences, with their figures masked", async () => {
    store.setPrivacy(true);
    const host = await show(`/movimientos/${REVERSE_SPLIT}`, Detail, "/movimientos/:id");
    const shown = text(host);

    expect(shown).toContain("Se venden");
    expect(shown).toContain("títulos de Physical Gold ETC en ETC y ETP");
    expect(shown).toContain(MASK);
    // No JSON, and not one figure of the sale: quantities, price, fees.
    expect(shown).not.toMatch(/[{}"]|forced_sale|per_account/);
    expect(shown).not.toMatch(/0[.,]25|0[.,]75|766|0[.,]50?\b/);
    expect(DECIMAL.test(figuresLeft(shown))).toBe(false);
  });

  it("says them all with the mask off", async () => {
    const shown = text(await show(`/movimientos/${REVERSE_SPLIT}`, Detail, "/movimientos/:id"));
    expect(shown).toContain(
      "Se venden 0,25 títulos de Physical Gold ETC en ETC y ETP a 766,56 USD cada uno, con una comisión de 0,50 USD.",
    );
    expect(shown).not.toContain(MASK);
  });

  it("masks the money of a configuration change, which is no longer JSON", async () => {
    store.setPrivacy(true);
    const shown = text(await show(`/movimientos/${SETTINGS}`, Detail, "/movimientos/:id"));
    expect(shown).toContain("Aportación mensual");
    expect(shown).not.toMatch(/[{}"]|monthly_contribution_eur|600,00/);
    expect(DECIMAL.test(figuresLeft(shown))).toBe(false);
  });

  it("masks what the correction screen says is recorded now", async () => {
    store.setPrivacy(true);
    const host = await show(`/movimientos/${PURCHASE}/editar`, Edit, "/movimientos/:id/editar");
    const card = [...host.querySelectorAll("section.card")].find((section) =>
      section.textContent?.includes("Como está registrado ahora"),
    );
    const shown = text(card);

    expect(shown).toContain(MASK);
    expect(shown).not.toMatch(/31[.,]2343|3\.?100/);
    expect(DECIMAL.test(figuresLeft(shown))).toBe(false);
    // Dates as a person writes them.
    expect(shown).toContain("03/09/2026");
    expect(shown).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("shows them in Spanish with the mask off", async () => {
    const host = await show(`/movimientos/${PURCHASE}/editar`, Edit, "/movimientos/:id/editar");
    const shown = text(host.querySelector("section.card"));
    expect(shown).toContain("31,2343");
    expect(shown).toContain("3.100,00 EUR");
  });
});

describe("the detail as data", () => {
  const events = goldenEvents();
  const state = projectLedger(events, { collectErrors: true });
  const entries = ledgerEntries(state, events);
  const names = nameIndex(state);

  it("never paints raw JSON: effects and settings are sentences", () => {
    for (const entry of entries) {
      const view = detailView(entry, names);
      for (const field of view.fields) {
        expect(field.text ?? "", `${entry.event.id}.${field.name}`).not.toMatch(/[{}[\]"]/);
      }
    }
    const reverse = entries.find((entry) => entry.event.id === "01MQTWHB78RC2FADH9B774BHS5");
    const effects = detailView(reverse as never, names).fields.find(
      (field) => field.name === "effects",
    );
    expect(effects?.kind).toBe("effects");
    // The quantity and the price of the forced sale travel as figures, for `Amount`.
    const parts = effects?.sentences?.flat() ?? [];
    expect(parts.some((part) => "quantity" in part)).toBe(true);
    expect(parts.some((part) => "amount" in part)).toBe(true);
    const words = parts.map((part) => ("text" in part ? part.text : "")).join("");
    expect(words).not.toMatch(/0[.,]25|766|0[.,]5\b/);
  });
});
