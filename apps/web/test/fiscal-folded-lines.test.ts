// @vitest-environment happy-dom
//
// What a folded card of the tax screen says on a phone: the line is all that is read there, so it
// never calls a card calm that holds a pending datum, a dead balance or a figure that moved.

import { Money } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { foldedBoxes } from "../src/routes/fiscal/BoxesCard.jsx";
import { foldedFiling } from "../src/routes/fiscal/FilingCard.jsx";
import { folded } from "../src/routes/fiscal/InformativeCard.jsx";
import { foldedLosses } from "../src/routes/fiscal/LossesCard.jsx";
import type { BoxesView, InformativeView } from "../src/view-models/fiscal/index.js";

const category = (verdict: string, extra: object = {}) => ({
  verdict,
  verdictText: verdict,
  missing: [],
  decided_with: [],
  ...extra,
});
const model = (categories: object[], extra: object = {}) =>
  ({ periodText: "", categories, ...extra }) as unknown as InformativeView;

describe("the folded line of a model", () => {
  it.each([
    [
      "undetermined over no filing",
      [category("not_obliged"), category("undetermined")],
      {},
      "undetermined",
    ],
    [
      "filing over undetermined",
      [category("undetermined"), category("obliged")],
      { filedText: "x" },
      "obliged",
    ],
    ["filing not on record", [category("obliged")], {}, "obliged · no consta presentado"],
    [
      "data missing under another verdict",
      [category("obliged"), category("undetermined", { missing: ["x"] })],
      { filedText: "x" },
      "obliged · faltan datos",
    ],
    [
      "a verdict reached with flagged values",
      [category("not_obliged", { decided_with: ["x"] })],
      {},
      "not_obliged · con datos marcados",
    ],
  ])("says %s", (_, categories, extra, line) => {
    expect(folded(model(categories, extra))).toBe(line);
  });
});

describe("the folded line of the losses", () => {
  const none = { pending: [], expired: [], expiring: [], anchors: [] };

  it.each([
    ["nothing", none, "No arrastras pérdidas"],
    ["a dead balance", { ...none, expired: [1] }, "1 saldo caducado"],
    ["an anchor", { ...none, anchors: [1] }, "anclado en lo declarado"],
    [
      "what expires",
      { ...none, pending: [1, 2], expiring: [1] },
      "2 saldos pendientes · caduca pronto",
    ],
  ])("says %s", (_, card, line) => {
    expect(foldedLosses(card)).toBe(line);
  });
});

describe("the folded line of what was filed", () => {
  const figure = (declared: string, now: string) => ({
    declared: Money.parse(declared, "EUR"),
    now: Money.parse(now, "EUR"),
  });

  it("counts the figures that moved, even with the fingerprint intact", () => {
    const filing = { filed_at: "2029-06-01", fingerprint_ok: true };
    expect(foldedFiling({ ...filing, figures: [figure("1", "1")] })).toBe(
      "Declarado el 01/06/2029",
    );
    expect(foldedFiling({ ...filing, figures: [figure("1", "2")] })).toContain("1 cifra distinta");
  });
});

describe("the folded line of the boxes", () => {
  it("says a year by concepts and the rows to check", () => {
    const rows = [{ missing: true }, { missing: false, partial: "x" }, { missing: false }];
    const view = { checked: false, blocks: [{ rows }] } as unknown as BoxesView;
    expect(foldedBoxes(view)).toBe("1 bloque · por conceptos, sin casillas · 2 filas por revisar");
  });
});
