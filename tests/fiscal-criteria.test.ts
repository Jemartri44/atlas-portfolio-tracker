// Anti-drift test of the fiscal criteria (feature 009, FR-030).
//
// The tax engine tags every figure with the criteria of
// `docs/fiscal-questions.md` and their certainty and direction of risk. The
// document is where the direction decides them; the catalogue of the code is a
// copy. This test reads the table of the document and fails when the two
// disagree.
//
// **What it is, and what it is not.** It is a **ratchet against future drift,
// not a proof that today's values are right**. What is written today is right
// because it is reasoned out in the document of criteria and in the
// per-variant comments of the catalogue — not because two files say the same
// thing. Asking it for more than that is asking it for what it does not give.
//
// **What it guarantees**, since feature 011, block 7: an **exact pairing**.
// Every identifier of the catalogue has exactly one row of the document, every
// row has an identifier of the catalogue, and the certainty and the risk of
// each one are **the** certainty and **the** risk its row declares — not one
// of a set.
//
// That used to be weaker, and the weakness was structural: the document had
// one row per **criterion** and the cells of the rows that name several
// readings were prose —"En disputa (valores no UE) / Baja (cripto) / Media
// (fondos)"— so the test could only check membership of the set, plus two
// crutches (that the weakest certainty of the row was carried by something,
// and that every risk of the row was carried by something) and a map of four
// exemptions for the cells the document left silent. A variant of #2 or #24
// could take the certainty of its sibling and this test stayed green — on the
// dimension that decides whether the user is told "nobody knows how this is
// read" or "this is settled, and this is what is behind it". The document now
// carries one row per **variant**, so pairing them needs no Spanish parsed and
// no cell can be empty.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FISCAL_CRITERIA } from "@atlas/domain/fiscal";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = readFileSync(join(repoRoot, "docs", "fiscal-questions.md"), "utf8");

interface Variant {
  /** The identifier of the catalogue, as the document writes it in backticks. */
  id: string;
  /** The row of the criterion it belongs to, which is how the documents cite it. */
  doc: string;
  certainty: string;
  risk: string;
}

const CERTAINTIES: Record<string, string> = {
  "en disputa": "disputed",
  alta: "high",
  media: "medium",
  baja: "low",
};

const RISKS: Record<string, string> = {
  conservador: "conservative",
  agresivo: "aggressive",
  ambas: "both",
  neutro: "neutral",
};

/**
 * The rows of the table that pairs each variant with its reading: from its own
 * header to the end of the table. One row per identifier, and a cell that is
 * not exactly one of the words of the vocabulary is a row this test refuses to
 * read rather than one it reads loosely.
 */
const variants = (): Variant[] => {
  const lines = doc.split("\n");
  const header = lines.findIndex((line) => line.startsWith("| # | Identificador |"));
  expect(header).toBeGreaterThan(-1);
  const found: Variant[] = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith("|")) {
      break;
    }
    const cells = line.split("|").map((cell) => cell.trim());
    const id = (cells[2] as string).replace(/`/g, "");
    found.push({
      id,
      doc: cells[1] as string,
      certainty: CERTAINTIES[(cells[4] as string).toLowerCase()] as string,
      risk: RISKS[(cells[5] as string).toLowerCase()] as string,
    });
  }
  return found;
};

describe("the fiscal criteria of the code and of docs/fiscal-questions.md", () => {
  it("finds the table of variants, with a word of the vocabulary in every cell", () => {
    const rows = variants();
    expect(rows.length).toBe(Object.keys(FISCAL_CRITERIA).length);
    // An empty cell, or one the vocabulary does not name, is not expressible:
    // the silence of a cell used to be a state, and now it is an assertion
    // somebody signs (feature 011, decision (k)).
    const unreadable = rows.filter((row) => row.certainty === undefined || row.risk === undefined);
    expect(unreadable.map((row) => row.id)).toEqual([]);
    expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining(["1", "2:other", "24:etc"]));
  });

  it("pairs every identifier with its own certainty and its own risk, exactly", () => {
    const mismatches: string[] = [];
    const documented = new Map(variants().map((row) => [row.id, row]));
    for (const [id, entry] of Object.entries(FISCAL_CRITERIA)) {
      const row = documented.get(id);
      if (row === undefined) {
        mismatches.push(`${id}: missing in the document`);
        continue;
      }
      if (row.certainty !== entry.certainty) {
        mismatches.push(`${id}: ${entry.certainty}, the document says ${row.certainty}`);
      }
      if (row.risk !== entry.risk) {
        mismatches.push(`${id}: ${entry.risk}, the document says ${row.risk}`);
      }
      if (row.doc !== entry.doc) {
        mismatches.push(`${id}: criterion #${entry.doc}, the document files it under #${row.doc}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("has nothing the catalogue does not have", () => {
    const known = new Set(Object.keys(FISCAL_CRITERIA));
    expect(
      variants()
        .map((row) => row.id)
        .filter((id) => !known.has(id)),
    ).toEqual([]);
  });

  /**
   * And every numbered criterion of the prose still has its variants: the row
   * that is cited as "criterion #2" in the documents and on the screens is the
   * one of the table above, and it must not be possible to add one there and
   * forget it here.
   */
  it("covers every numbered criterion of the prose table", () => {
    const lines = doc.split("\n");
    const header = lines.findIndex(
      (line) => line.startsWith("| # |") && line.includes("Criterio aplicado"),
    );
    const numbered: string[] = [];
    for (const line of lines.slice(header + 2)) {
      if (line.startsWith("### ")) {
        break;
      }
      const match = /^\| (\d+b?) \|/.exec(line);
      if (match !== null) {
        numbered.push(match[1] as string);
      }
    }
    expect(numbered.length).toBeGreaterThan(20);
    const covered = new Set(variants().map((row) => row.doc));
    expect(numbered.filter((id) => !covered.has(id))).toEqual([]);
  });
});
