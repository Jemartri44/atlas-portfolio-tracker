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
  const repurchase = (parts: { within_period: boolean; after_period_year?: number }) =>
    shown(impact({ kind: "repurchase", filing_deadline: "2026-06-30", ...parts }));

  it("is compulsory, with interest, after a repurchase past the filing period (art. 73.2)", () => {
    const text = repurchase({ within_period: false, after_period_year: 2026 });
    expect(text).toContain(
      "Hay que presentar una autoliquidación rectificativa de la Renta de 2025 (marca la casilla [121]), con intereses de demora, antes de que acabe el plazo de la Renta de 2026 (art. 73.2 RIRPF).",
    );
    expect(text).not.toContain("Puede que toque");
    expect(text).not.toContain("anterior al fin del plazo");
  });

  it("is a rectification as soon as possible when the purchase came within the period", () => {
    const text = repurchase({ within_period: true });
    expect(text).toContain("anterior al fin del plazo de la Renta de 2025 (30/06/2026)");
    expect(text).toContain("autoliquidación rectificativa");
    expect(text).toContain("no es el caso del art. 73.2 RIRPF");
    expect(text).toContain("presentarla dentro de él es lo que evita presentarla fuera de plazo");
    expect(text).not.toContain("evitar el recargo");
    expect(text).not.toContain("casilla [121]");
  });

  it("says both cases when there are purchases within the period and after it", () => {
    const text = repurchase({ within_period: true, after_period_year: 2026 });
    expect(text).toContain("anterior al fin del plazo");
    expect(text).toContain("con intereses de demora");
  });

  it("is only possible otherwise", () => {
    expect(shown(impact({ kind: "possible" }))).toContain(
      "Puede que toque presentar una complementaria.",
    );
  });
});
