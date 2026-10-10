// @vitest-environment happy-dom
//
// The amount of THIS month, typed on the contribution card. Empty means the
// amount of the settings; what is typed goes through the same reading as every
// typed number (a Spanish keyboard, never a float), must be positive, and is
// kept on the screen only. A text that does not serve never breaks the card.

import { describe, expect, it } from "vitest";
import Cartera from "../src/routes/cartera/index.jsx";
import { typedAmount } from "../src/view-models/core/index.js";
import { goldenText } from "./helpers/golden.js";
import { openLedger, settle, show, text, type, withGoldenLedger } from "./helpers/render.jsx";

describe("typedAmount", () => {
  it("is nothing when the field is empty or blank", () => {
    expect(typedAmount("")).toEqual({ kind: "none" });
    expect(typedAmount("   ")).toEqual({ kind: "none" });
  });

  it("reads a Spanish amount into a decimal string", () => {
    expect(typedAmount("1.200,50")).toEqual({ kind: "amount", value: "1200.50" });
    expect(typedAmount("600")).toEqual({ kind: "amount", value: "600" });
  });

  it("refuses an ambiguous or malformed text with a sentence", () => {
    for (const raw of ["1.5", "abc", "1,2,3"]) {
      const outcome = typedAmount(raw);
      expect(outcome.kind).toBe("invalid");
    }
  });

  it("refuses more than two decimals", () => {
    expect(typedAmount("100,005")).toEqual({
      kind: "invalid",
      message: "Como mucho dos decimales.",
    });
    expect(typedAmount("100,50")).toEqual({ kind: "amount", value: "100.50" });
  });

  it("refuses zero and negative amounts", () => {
    for (const raw of ["0", "0,00", "-5"]) {
      expect(typedAmount(raw)).toEqual({
        kind: "invalid",
        message: "La aportación tiene que ser mayor que cero.",
      });
    }
  });
});

withGoldenLedger();

const DATE = "2029-01-10";

const card = (host: HTMLElement): Element | undefined =>
  [...host.querySelectorAll("section.card")].find((section) =>
    text(section.querySelector("h2")).startsWith("Aportación de"),
  );

const origin = (host: HTMLElement): string =>
  text(card(host)?.querySelector("[data-testid=amount-origin]"));
const thisMonth = (host: HTMLElement): string => text(card(host)?.querySelector(".kpi dd"));

describe("the contribution card with an amount for this month", () => {
  it("starts on the amount of the settings and says so", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    expect(origin(host)).toContain("ajustes");
    const field = host.querySelector<HTMLInputElement>("#contribution-amount");
    expect(field?.value).toBe("");
    expect(field?.placeholder).toBe("El de los ajustes");
  });

  it("uses the typed amount, says it was typed, and goes back when emptied", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    const fromSettings = thisMonth(host);
    type(host, "contribution-amount", "777,50");
    await settle();
    expect(thisMonth(host)).toContain("777,50");
    expect(origin(host)).toContain("escrito");
    type(host, "contribution-amount", "");
    await settle();
    expect(thisMonth(host)).toBe(fromSettings);
    expect(origin(host)).toContain("ajustes");
  });

  it("shows the error under the field and keeps the card standing", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    const fromSettings = thisMonth(host);
    type(host, "contribution-amount", "1.5");
    await settle();
    expect(host.querySelector("#contribution-amount-error")).not.toBeNull();
    expect(thisMonth(host)).toBe(fromSettings);
    expect(origin(host)).toContain("ajustes");
    type(host, "contribution-amount", "0");
    await settle();
    expect(text(host.querySelector("#contribution-amount-error"))).toContain("mayor que cero");
  });
});

describe("the card when the settings have no monthly contribution", () => {
  it("shows the split with the typed amount and says it was typed here", async () => {
    const stripped = goldenText()
      .split("\n")
      .map((line) => {
        if (line.length === 0) {
          return line;
        }
        const event = JSON.parse(line);
        delete event.settings?.monthly_contribution_eur;
        return JSON.stringify(event);
      })
      .join("\n");
    await openLedger(stripped);
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    expect(card(host)?.querySelector('ul[aria-label="Reparto de la aportación"]')).toBeNull();
    expect(host.querySelector("#contribution-amount")).not.toBeNull();
    type(host, "contribution-amount", "500");
    await settle();
    expect(card(host)?.querySelector('ul[aria-label="Reparto de la aportación"]')).not.toBeNull();
    expect(origin(host)).toContain("Importe escrito aquí");
  });
});
