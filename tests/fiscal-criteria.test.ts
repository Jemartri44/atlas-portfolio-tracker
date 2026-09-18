// Anti-drift test of the fiscal criteria (feature 009, FR-030).
//
// The tax engine tags every figure with the criteria of
// `docs/fiscal-questions.md` and their certainty and direction of risk. The
// document is where the direction decides them; the catalogue of the code is a
// copy. This test reads the table of the document and fails when the two
// disagree, so a criterion that moves in the document cannot keep its old
// certainty in the report.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FISCAL_CRITERIA } from "@atlas/domain";
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
    risk: "a window no reading of the document supports (days, or two months for a fund): its risk runs either way",
  },
  "2:crypto": {
    risk: "the document gives crypto a certainty (low) and no direction of risk: one year by prudence defers more, the conservative side",
  },
  "2:fund": {
    certainty:
      "the document states no certainty for the one year of funds, the letter g) of article 33.5, which it does not dispute",
    risk: "and no direction either: one year is the longer window, the conservative side",
  },
};

/** In the catalogue and not in the table: the question of ETC and ETP, which has no number. */
const NOT_IN_THE_TABLE = new Set(["ETC/ETP"]);

describe("the fiscal criteria of the code and of docs/fiscal-questions.md", () => {
  it("finds the table, all of it", () => {
    expect(rows().map((row) => row.id)).toEqual(expect.arrayContaining(["1", "2b", "17", "23"]));
    expect(rows().every((row) => row.certainty.size > 0 && row.risk.size > 0)).toBe(true);
  });

  it("says of every criterion what the document says: its certainty and its direction of risk", () => {
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
      (id) => !documented.has(id) && !NOT_IN_THE_TABLE.has(id),
    );
    expect(extra).toEqual([]);
  });
});
