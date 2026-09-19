// @vitest-environment happy-dom
//
// The condition the direction attached to Q5: **the axis of a chart is an
// amount for every purpose**, so with the privacy mode on there can be no
// absolute figure anywhere on it.
//
// What is rendered here is everything of a chart that is DOM — the legend and
// the equivalent table — plus the two formatters the canvas asks for, which is
// where the rule actually lives. The canvas itself cannot be painted headlessly
// (`happy-dom` has no 2D context, and faking one would be reimplementing a
// browser badly), so the drawn axis is checked in Chromium instead, which is
// the stronger test anyway.

import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { axisAmount, axisDate, spanOf } from "../src/components/chart/axis.js";
import { ChartLegend } from "../src/components/chart/ChartLegend.jsx";
import { ChartTable } from "../src/components/chart/ChartTable.jsx";
import { MASK } from "../src/format/money.js";
import { store } from "../src/ledger/state.js";

const disposers: (() => void)[] = [];

const mount = (component: () => ReturnType<typeof ChartLegend>): HTMLElement => {
  const host = document.createElement("div");
  document.body.append(host);
  disposers.push(render(component, host));
  return host;
};

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  document.body.innerHTML = "";
  store.setPrivacy(false);
});

/** Any run of digits: the thing that must not survive the mask. */
const DIGITS = /\d/;

describe("the axis of a chart is an amount", () => {
  it("shows the mask instead of the figure when privacy is on", () => {
    expect(axisAmount(12_345, false)).toBe("12 k");
    expect(axisAmount(12_345, true)).toBe(MASK);
    expect(axisAmount(2_500_000, false)).toBe("2,5 M");
    expect(axisAmount(2_500_000, true)).toBe(MASK);
    expect(axisAmount(750, false)).toBe("750");
    expect(axisAmount(750, true)).toBe(MASK);
  });

  it("gives nothing for a value that is not a number", () => {
    expect(axisAmount(null, false)).toBe("");
    expect(axisAmount(Number.NaN, false)).toBe("");
  });

  it("dates the X axis by the span it covers", () => {
    const day = 86_400;
    expect(spanOf(0, 30 * day)).toBe("days");
    expect(spanOf(0, 200 * day)).toBe("months");
    expect(spanOf(0, 2000 * day)).toBe("years");
    // 2027-06-30, as seconds since the epoch.
    const when = Date.UTC(2027, 5, 30) / 1000;
    expect(axisDate(when, "years")).toBe("2027");
    expect(axisDate(when, "months")).toContain("27");
    expect(axisDate(when, "days")).toContain("30");
  });
});

describe("the equivalent table of a chart", () => {
  const rows = [
    { date: "2027-06-30", values: ["1234.56", undefined] },
    { date: "2027-12-31", values: ["2000.00", "500.00"] },
  ];

  it("paints the figures through Amount, so privacy covers them", () => {
    store.setPrivacy(true);
    const host = mount(() => (
      <ChartTable headers={["Núcleo", "Cubo"]} rows={rows} caption="Evolución" />
    ));

    const text = host.textContent ?? "";
    expect(text).toContain(MASK);
    // The dates stay: they are not amounts. Nothing else numeric survives.
    const withoutDates = text.replace(/\d{2}\/\d{2}\/\d{4}/g, "");
    expect(DIGITS.test(withoutDates)).toBe(false);
  });

  it("shows the figures when privacy is off, and a hole where there is no data", () => {
    store.setPrivacy(false);
    const host = mount(() => (
      <ChartTable headers={["Núcleo", "Cubo"]} rows={rows} caption="Evolución" />
    ));

    const text = host.textContent ?? "";
    expect(text).toContain("1.234,56");
    expect(text).toContain("sin dato");
    expect(text).not.toContain(MASK);
  });

  /**
   * On a phone there is no header row, so the card has to name what each figure
   * is. It did not: the first series went to the card's right-hand figure and
   * the rest sat on the first line as bare numbers, in an order that did not
   * even match the table's. Three unlabelled figures, one of them the core and
   * one the cash, and no way to tell which. Found by looking at 400px, not by
   * running anything.
   */
  it("names every series on the card, where there is no header to do it", () => {
    store.setPrivacy(false);
    const host = mount(() => (
      <ChartTable headers={["Núcleo", "Cubo"]} rows={rows} caption="Evolución" />
    ));
    const card = host.querySelector("ul.rows li");
    const lines = [...(card?.querySelectorAll(".sub > span") ?? [])].map(
      (node) => node.textContent ?? "",
    );

    // With its currency: on a card there is no header to say € either.
    expect(lines).toEqual(["Núcleo 1.234,56\u00a0€", "Cubo sin dato"]);
    // And nothing numeric is left loose on the card's first line.
    expect(card?.querySelector(".title")?.textContent).toBe("30/06/2027");
  });

  it("says once, above the table, what is missing and why", () => {
    const host = mount(() => (
      <ChartTable
        headers={["Núcleo"]}
        rows={rows}
        caption="Evolución"
        missing="Faltan 3 puntos: no hay precio de Global Bond Index Fund."
      />
    ));

    expect(host.textContent).toContain("Faltan 3 puntos");
  });
});

describe("the legend of a chart", () => {
  it("carries the name and a dash, not only a colour", () => {
    const host = mount(() => (
      <ChartLegend
        series={[
          { label: "Núcleo", values: [], colour: "--c-series-core" },
          { label: "Cubo", values: [], colour: "--c-series-bucket", dash: [6, 4] },
        ]}
      />
    ));

    expect(host.textContent).toContain("Núcleo");
    expect(host.textContent).toContain("Cubo");
    expect(host.querySelectorAll(".entry.is-dashed")).toHaveLength(1);
    expect(host.querySelectorAll(".entry.is-solid")).toHaveLength(1);
    expect(host.querySelector(".swatch.is-core")).not.toBeNull();
  });

  it("is a list, so a screen reader announces how many series there are", () => {
    const host = mount(() => (
      <ChartLegend series={[{ label: "Efectivo", values: [], colour: "--c-series-cash" }]} />
    ));

    expect(host.querySelector("ul.chart-legend")).not.toBeNull();
    expect(host.querySelectorAll("li")).toHaveLength(1);
  });
});
