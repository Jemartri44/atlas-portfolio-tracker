// @vitest-environment happy-dom
//
// The warning of a filed Renta says what the reader has to do: a repurchase that defers a loss
// the return computed makes the supplementary return compulsory (art. 73.2 RIRPF); anything
// else, the engine cannot tell.

import type { ClosedYearImpact } from "@atlas/domain/fiscal";
import { render } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { ClosedYearNotice } from "../src/components/ClosedYearNotice.jsx";

const impact = (supplementary: ClosedYearImpact["supplementary"]): ClosedYearImpact => ({
  model: "renta",
  year: 2025,
  filing_id: "01ARYZ6S41TSV4RRFFQ6900099",
  filed_at: "2026-05-15",
  by_date: false,
  comparison: {
    status: "compared",
    moves: [{ figure: "savings_base", before: "800", after: "1000" }],
  },
  supplementary,
});

const shown = (value: ClosedYearImpact): string => {
  const host = document.createElement("div");
  const dispose = render(() => <ClosedYearNotice impacts={[value]} />, host);
  const text = host.textContent ?? "";
  dispose();
  return text;
};

describe("the supplementary return of a filed Renta", () => {
  it("is compulsory, with interest, after a repurchase past the filing period (art. 73.2)", () => {
    const text = shown(
      impact({
        kind: "repurchase",
        acquisition_year: 2026,
        filing_deadline: "2026-06-30",
        after_deadline: true,
      }),
    );
    expect(text).toContain(
      "Hay que presentar una autoliquidación rectificativa de la Renta de 2025 (marca la casilla [121]), con intereses de demora, antes de que acabe el plazo de la Renta de 2026 (art. 73.2 RIRPF).",
    );
    expect(text).not.toContain("Puede que toque");
  });

  it("is a rectification as soon as possible when the purchase came before the end of the period", () => {
    const text = shown(
      impact({
        kind: "repurchase",
        acquisition_year: 2026,
        filing_deadline: "2026-06-30",
        after_deadline: false,
      }),
    );
    expect(text).toContain("anterior al fin del plazo de la Renta de 2025 (30/06/2026)");
    expect(text).toContain("autoliquidación rectificativa");
    expect(text).toContain("no es el caso del art. 73.2 RIRPF");
    expect(text).not.toContain("casilla [121]");
  });

  it("is only possible otherwise", () => {
    expect(shown(impact({ kind: "possible" }))).toContain(
      "Puede que toque presentar una complementaria.",
    );
  });
});
