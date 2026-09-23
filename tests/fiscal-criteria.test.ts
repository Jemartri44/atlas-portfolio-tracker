// Anti-drift test of the fiscal criteria (feature 009, FR-030).
//
// The tax engine tags every figure with the criteria of
// `docs/fiscal-questions.md` and their certainty and direction of risk. The
// document is where the direction decides them; the catalogue of the code is a
// copy. This test reads the table of the document and fails when the two
// disagree.
//
// **What it guarantees, exactly** — it is worth saying, because it has been
// described as "the catalogue follows whatever the document says", and that is
// more than it holds:
//
//   1. Every row of the table has at least one entry in the catalogue, and
//      every entry of the catalogue has a row.
//   2. Every certainty and every risk an entry carries is **one of those the
//      row names**. For the rows that name a single certainty and a single
//      risk —most of them— that is exact: the entry has to say that and
//      nothing else.
//   3. The **weakest** certainty of the row is carried by something, and every
//      risk of the row is carried by something. So a row that says "disputed
//      for a, medium for b" cannot end up with every variant on medium.
//
// **What it does not guarantee**: on a row that names several readings, it
// does not tie **each variant to its own one**. The cell is prose —"En
// disputa (valores no UE) / Baja (cripto) / Media (fondos)"— and pairing each
// parenthesis with an identifier would mean parsing Spanish, which breaks the
// day somebody rewords the sentence and gives a false green in between. So a
// variant of such a row could take a certainty that belongs to its sibling and
// this test would stay green. What holds that today is the per-variant comment
// in `packages/domain/src/tax/criteria.ts`, which states the reason for each
// one, and reading it against the document. Only rows #2 and #24 name more
// than one reading; anywhere else point 2 is already exact.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FISCAL_CRITERIA } from "@atlas/domain/fiscal";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = readFileSync(join(repoRoot, "docs", "fiscal-questions.md"), "utf8");

interface Row {
  id: string;
  certainty: Set<string>;
  risk: Set<string>;
}

const keywords = (cell: string, words: readonly (readonly [string, string])[]): Set<string> =>
  new Set(words.filter(([word]) => cell.includes(word)).map(([, value]) => value));

/**
 * The rows of the table of criteria: from the header that names "Criterio
 * aplicado" to the next section. A note written between two rows breaks the
 * table in Markdown but not the list of criteria, so the scan does not stop at
 * the first line that is not a row.
 */
const rows = (): Row[] => {
  const lines = doc.split("\n");
  const header = lines.findIndex(
    (line) => line.startsWith("| # |") && line.includes("Criterio aplicado"),
  );
  const found: Row[] = [];
  for (const line of lines.slice(header + 2)) {
    if (line.startsWith("## ")) {
      break;
    }
    if (!/^\| \d+b? \|/.test(line)) {
      continue;
    }
    const cells = line.split("|").map((cell) => cell.replaceAll("*", "").trim().toLowerCase());
    found.push({
      id: cells[1] as string,
      certainty: keywords(cells[5] as string, [
        ["en disputa", "disputed"],
        ["alta", "high"],
        ["media", "medium"],
        ["baja", "low"],
      ]),
      risk: keywords(cells[6] as string, [
        ["conservador", "conservative"],
        ["agresivo", "aggressive"],
        ["ambas", "both"],
        ["neutro", "neutral"],
      ]),
    });
  }
  return found;
};

/** The more doubtful first: a catalogue entry may not be firmer than the document's weakest reading. */
const DOUBT = ["disputed", "low", "medium", "high"];

/**
 * Variants of a criterion on which the document is silent, dimension by
 * dimension, with the reason. Only the dimension named here is exempt:
 * everything else must say exactly what the document says.
 */
const DOCUMENT_SILENT: Record<string, { certainty?: string; risk?: string }> = {
  "2:listed_1y": {
    risk: "the document gives the risk of the two months; one year for a listed security is the other side of the same dispute, the conservative one",
  },
  "2:other": {
    risk: "a window no reading of the document supports —a number of days—: its risk runs either way",
  },
  "2:crypto": {
    risk: "the document gives crypto a certainty (low) and no direction of risk: one year by prudence defers more, the conservative side",
  },
  "2:fund_1y": {
    risk: "the document gives the risk of the two months of a fund; one year is the other side of the same dispute, the conservative one",
  },
};

describe("the fiscal criteria of the code and of docs/fiscal-questions.md", () => {
  it("finds the table, all of it", () => {
    expect(rows().map((row) => row.id)).toEqual(expect.arrayContaining(["1", "2b", "17", "23"]));
    expect(rows().every((row) => row.certainty.size > 0 && row.risk.size > 0)).toBe(true);
  });

  it("gives every criterion a certainty and a risk the document names for its row", () => {
    const mismatches: string[] = [];
    for (const row of rows()) {
      const mine = Object.entries(FISCAL_CRITERIA).filter(([, entry]) => entry.doc === row.id);
      if (mine.length === 0) {
        mismatches.push(`#${row.id}: missing in the catalogue`);
        continue;
      }
      for (const [key, entry] of mine) {
        const silent = DOCUMENT_SILENT[key] ?? {};
        if (silent.certainty === undefined && !row.certainty.has(entry.certainty)) {
          mismatches.push(`${key}: ${entry.certainty}, the document says ${[...row.certainty]}`);
        }
        if (silent.risk === undefined && !row.risk.has(entry.risk)) {
          mismatches.push(`${key}: ${entry.risk}, the document says ${[...row.risk]}`);
        }
      }
      const weakest = DOUBT.find((level) => row.certainty.has(level)) as string;
      if (!mine.some(([, entry]) => entry.certainty === weakest)) {
        mismatches.push(`#${row.id}: nothing carries the weakest certainty, ${weakest}`);
      }
      for (const risk of row.risk) {
        if (!mine.some(([, entry]) => entry.risk === risk)) {
          mismatches.push(`#${row.id}: nothing carries the risk ${risk}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("has nothing the document does not have", () => {
    const documented = new Set(rows().map((row) => row.id));
    const extra = [...new Set(Object.values(FISCAL_CRITERIA).map((entry) => entry.doc))].filter(
      (id) => !documented.has(id),
    );
    expect(extra).toEqual([]);
  });
});
