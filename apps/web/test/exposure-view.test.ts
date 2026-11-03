// @vitest-environment happy-dom
//
// What the exposure screens compose from the domain: the bars, the labels, the changes to the file and
// the reading of the percentages typed in the dialog.

import { describe, expect, it } from "vitest";
import { readRows } from "../src/routes/ajustes/SplitDialog.jsx";
import {
  barOf,
  indexLabel,
  keyLabel,
  withIndex,
  withoutOwn,
  withSplit,
} from "../src/view-models/core/exposure.js";

describe("barOf", () => {
  it("keeps the three largest parts in colour and groups the rest, always with the figure in text", () => {
    const view = barOf("currency", [
      { key: "JPY", pct: "6" },
      { key: "USD", pct: "70" },
      { key: "EUR", pct: "10" },
      { key: "GBP", pct: "5" },
      { key: "CHF", pct: "4" },
      { key: "CAD", pct: "3" },
      { key: "AUD", pct: "0" },
    ]);
    expect(view.segments.map((s) => s.key)).toEqual(["a", "b", "c", "rest"]);
    expect(view.legend.map((e) => e.label)).toEqual(["USD", "EUR", "JPY", "Otras (3)"]);
    expect(view.legend.map((e) => e.figure.replace(/\u00a0/g, " "))).toEqual([
      "70 %",
      "10 %",
      "6 %",
      "5 %",
      "7 %",
    ]);
    expect(view.segments.reduce((sum, s) => sum + s.width, 0)).toBe(98);
  });

  it("names the regions in words and leaves an unknown key as it is", () => {
    expect(keyLabel("region", "europe_developed")).toBe("Europa desarrollada");
    expect(keyLabel("region", "mars")).toBe("mars");
  });
});

describe("indexLabel", () => {
  it("is complete for a profile of a fund's portfolio and for a definition", () => {
    expect(
      indexLabel({
        key: "k",
        name: "MSCI World",
        as_of: "2026-11-02",
        via: "SPDR MSCI World UCITS ETF (Acc)",
        proposed: true,
      }),
    ).toBe(
      "por defecto · MSCI World (según la cartera de SPDR MSCI World UCITS ETF (Acc)) · ficha 02/11/2026",
    );
    expect(indexLabel({ key: "g", name: "Physical gold", proposed: true })).toBe(
      "por defecto · Physical gold · por definición",
    );
  });
});

describe("changing the exposure", () => {
  it("keeps the file free of assets with nothing to say", () => {
    const one = withIndex({}, "a", "msci_world");
    expect(one).toEqual({ a: { index: "msci_world" } });
    const both = withSplit(one, "a", "currency", { USD: "100" });
    expect(both).toEqual({ a: { index: "msci_world", currency: { USD: "100" } } });
    expect(withoutOwn(both, "a")).toEqual({ a: { index: "msci_world" } });
    expect(withIndex(withoutOwn(both, "a"), "a", "")).toEqual({});
    expect(withoutOwn({}, "b")).toEqual({});
  });
});

describe("readRows", () => {
  const read = (
    rows: { key: string; pct: string }[],
    dimension: "currency" | "region" = "currency",
  ) => readRows(dimension, rows);

  it("is a split only when it adds up to exactly 100, and says how much is missing or left over", () => {
    expect(
      read([
        { key: "USD", pct: "60,5" },
        { key: "EUR", pct: "39,5" },
      ]).split,
    ).toEqual({
      USD: "60.5",
      EUR: "39.5",
    });
    expect(read([{ key: "USD", pct: "60" }]).problem).toBe(
      "Suman 60 %: faltan 40 para llegar a 100.",
    );
    expect(
      read([
        { key: "USD", pct: "70" },
        { key: "EUR", pct: "40" },
      ]).problem,
    ).toBe("Suman 110 %: sobran 10 para quedarse en 100.");
    expect(read([]).problem).toBe("Añade al menos una fila.");
  });

  it("refuses a dot, a negative, a bad key and a repeated one, each on its own row", () => {
    expect(read([{ key: "USD", pct: "1.5" }]).rowErrors[0]).toContain("punto");
    expect(read([{ key: "USD", pct: "-5" }]).rowErrors[0]).toBe("No puede ser negativo.");
    expect(read([{ key: "US", pct: "100" }]).rowErrors[0]).toBe("Tres letras, por ejemplo USD.");
    expect(read([{ key: "", pct: "100" }], "region").rowErrors[0]).toBe("Elige la región.");
    const repeated = read([
      { key: "USD", pct: "50" },
      { key: "USD", pct: "50" },
    ]);
    expect(repeated.rowErrors).toEqual([undefined, "Repetida."]);
    expect(repeated.problem).toBe("Hay una clave repetida.");
  });
});
