// What the export says (review of PR #97, security B2 and N3): the file of
// the ledger always; when the sync holds something back, how many operations
// and in which file they go apart, with their own button; and when what is
// held cannot be read, that it was not exported.

import { describe, expect, it } from "vitest";
import { exportSaid } from "../src/ledger/export.js";

describe("the sentence of an export", () => {
  it("names the file of the ledger, and nothing else when nothing is held back", () => {
    expect(exportSaid({})).toEqual({
      severity: "info",
      text: "Tus datos van en ledger.jsonl. Guárdalo donde tengas la copia de seguridad.",
    });
  });

  it("names ledger.held.jsonl, how many operations it carries and its button", () => {
    const said = exportSaid({ held: { text: "x\n", operations: 3 } });
    expect(said.severity).toBe("caution");
    expect(said.text).toContain("ledger.jsonl");
    expect(said.text).toContain("retiene 3 operaciones");
    expect(said.text).toContain("ledger.held.jsonl");
    expect(said.text).toContain("«Descargar lo retenido»");
    expect(exportSaid({ held: { text: "x\n", operations: 1 } }).text).toContain(
      "retiene 1 operación ",
    );
  });

  it("says what is held back could not be exported when it cannot be read", () => {
    const said = exportSaid({ heldUnreadable: true });
    expect(said.severity).toBe("caution");
    expect(said.text).toContain("ledger.jsonl");
    expect(said.text).toContain("no se ha podido leer, así que no se ha exportado");
  });
});
