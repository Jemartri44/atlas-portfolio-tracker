// @vitest-environment happy-dom
//
// M5 of feature 020 (E3): the deviation of each asset class as a strip, in ink
// and without a band, with «N activos fuera de umbral» taken from the warnings
// of the domain and never from comparing figures; the full strip, with its
// band and its coloured dot, stays per asset (the `Gauge`).

import { describe, expect, it } from "vitest";
import Cartera from "../src/routes/cartera/index.jsx";
import { STRIP_SPAN_PP, stripX } from "../src/routes/cartera/Strip.jsx";
import { show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const weights = (host: HTMLElement): Element | undefined =>
  [...host.querySelectorAll("section.card")].find(
    (section) => section.querySelector("h2")?.textContent === "Pesos frente al objetivo",
  );

describe("where the dot of the strip goes", () => {
  it("sits at the middle on the target and spans ±5 pp", () => {
    expect(STRIP_SPAN_PP).toBe(5);
    expect(stripX("0")).toBe(50);
    expect(stripX("2.5")).toBe(75);
    expect(stripX("-2.5")).toBe(25);
  });

  it("stays on the track when the deviation is far, and at the middle when it is not a number", () => {
    expect(stripX("5")).toBe(97);
    expect(stripX("40")).toBe(97);
    expect(stripX("-40")).toBe(3);
    expect(stripX("x")).toBe(50);
  });
});

describe("the strip of each class", () => {
  it("is drawn for every class, with a label that says points and no amount", async () => {
    // 10/01/2027: the six assets have a weight and five are off target.
    const host = await show("/cartera?fecha=2027-01-10", Cartera);
    const strips = [...(weights(host)?.querySelectorAll("li.class-row svg.strip") ?? [])];
    expect(strips).toHaveLength(4);
    for (const strip of strips) {
      expect(strip.getAttribute("role")).toBe("img");
      expect(strip.getAttribute("aria-label")).toMatch(
        /^Desviación de [+−-]?\d[\d.]*,\d+\spp frente al objetivo$/,
      );
      // In ink and without a band: neither the band nor an off-target dot.
      expect(strip.querySelector(".band")).toBeNull();
      expect(strip.querySelector(".is-off")).toBeNull();
      expect(strip.classList.contains("is-off")).toBe(false);
    }
  });

  it("is in the table too, beside the figure, and the full gauge stays per asset", async () => {
    const host = await show("/cartera?fecha=2027-01-10", Cartera);
    const table = weights(host)?.querySelector('table[aria-label="Pesos por tipo de activo"]');
    expect(table?.querySelectorAll("svg.strip")).toHaveLength(4);
    expect(weights(host)?.querySelectorAll("svg.gauge")).toHaveLength(6);
    expect(weights(host)?.querySelectorAll("svg.gauge.is-off")).toHaveLength(5);
  });

  it("counts the assets the domain warned about, class by class, and nothing else", async () => {
    const host = await show("/cartera?fecha=2027-01-10", Cartera);
    const labels = [...(weights(host)?.querySelectorAll("li.class-row .tag") ?? [])]
      .map(text)
      .filter((label) => label.includes("fuera de umbral"));
    // Five assets are off target in all; each label counts those of its class.
    const counted = labels.reduce((sum, label) => sum + Number.parseInt(label, 10), 0);
    expect(counted).toBe(5);
    expect(labels.some((label) => label === "1 activo fuera de umbral")).toBe(true);
  });

  it("says nothing of a threshold when no asset of the class was warned about", async () => {
    const host = await show("/cartera?fecha=2029-01-10", Cartera);
    const offAssets = weights(host)?.querySelectorAll("svg.gauge.is-off").length ?? 0;
    const labels = [...(weights(host)?.querySelectorAll("li.class-row .tag") ?? [])].filter((tag) =>
      text(tag).includes("fuera de umbral"),
    );
    const counted = labels.reduce((sum, tag) => sum + Number.parseInt(text(tag), 10), 0);
    expect(counted).toBe(offAssets);
  });

  it("has no strips over a partial total, where there are no weights to deviate", async () => {
    const host = await show("/cartera?fecha=2027-06-30", Cartera);
    expect(weights(host)?.querySelectorAll("svg.strip")).toHaveLength(0);
    expect(text(weights(host)?.querySelector(".strip-scale") ?? null)).toBe("");
  });
});
