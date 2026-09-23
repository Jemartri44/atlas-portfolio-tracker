// The names of the fiscal criteria: one per criterion of the catalogue, and
// not a trace of the identifier the engine uses (prompt 010, block 4).
//
// The completeness half is enforced by the type — `Record<CriterionId, string>`
// does not compile with one missing — so what is left to check is what a type
// cannot see: that a name is a sentence and not `2:fund_1y` with spaces, that
// nobody wrote "criterio #18", and that the two ends of the risk are said in
// words, because the direction is what survives the privacy mask.

import { CRITERION_IDS, FISCAL_CRITERIA } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import {
  CERTAINTY_LABELS,
  CRITERION_NAMES,
  certaintyTone,
  DIRECTION_SENTENCES,
  MEASURE_LABELS,
  MEASURE_REASONS,
} from "../src/format/criteria.js";

describe("the names of the criteria", () => {
  it("names every criterion of the catalogue", () => {
    const missing = CRITERION_IDS.filter((id) => (CRITERION_NAMES[id] ?? "").trim().length === 0);
    expect(missing).toEqual([]);
    expect(Object.keys(CRITERION_NAMES).sort()).toEqual([...CRITERION_IDS].sort());
  });

  it("never shows the identifier, the number of the criterion or the file it lives in", () => {
    const offenders = CRITERION_IDS.filter((id) => {
      const name = CRITERION_NAMES[id];
      return (
        name.includes(":") ||
        /\bcriterio\b/i.test(name) ||
        /#\d/.test(name) ||
        /\.md\b/.test(name) ||
        /\bADR-\d/.test(name)
      );
    });
    expect(offenders).toEqual([]);
  });

  it("reads as a sentence: it starts in upper case and does not end in a full stop", () => {
    const odd = CRITERION_IDS.filter((id) => {
      const name = CRITERION_NAMES[id];
      return name.length < 20 || name[0] !== name[0]?.toUpperCase() || name.endsWith(".");
    });
    expect(odd).toEqual([]);
  });

  it("tells the two readings of a disputed criterion apart", () => {
    // The same dispute, two sides: if both were named the same, the screen
    // would say the user applied the prudent reading when he applied the other.
    expect(CRITERION_NAMES["2:listed"]).not.toBe(CRITERION_NAMES["2:listed_1y"]);
    expect(CRITERION_NAMES["24:etc"]).not.toBe(CRITERION_NAMES["24:etc_gain"]);
    expect(new Set(Object.values(CRITERION_NAMES)).size).toBe(CRITERION_IDS.length);
  });

  it("says in words what happens if the reading is wrong", () => {
    for (const direction of ["conservative", "aggressive", "both", "neutral", "none"] as const) {
      expect(DIRECTION_SENTENCES[direction].length).toBeGreaterThan(20);
    }
    expect(DIRECTION_SENTENCES.conservative).toContain("de más");
    expect(DIRECTION_SENTENCES.aggressive).toContain("de menos");
  });

  it("marks only a disputed criterion as a warning", () => {
    expect(certaintyTone("disputed")).toBe("caution");
    for (const certainty of ["high", "medium", "low"] as const) {
      expect(certaintyTone(certainty)).toBe("neutral");
      expect(CERTAINTY_LABELS[certainty].length).toBeGreaterThan(0);
    }
  });

  it("explains every measure and every reason the engine can give", () => {
    for (const measure of ["difference", "exposure", "not_quantifiable"] as const) {
      expect(MEASURE_LABELS[measure].length).toBeGreaterThan(0);
    }
    // The four codes of `CriterionStake.reason`, which the domain documents.
    for (const reason of [
      "invalid_under_alternative",
      "lot_in_other_currency",
      "regime_not_recorded",
      "no_carrier_left",
    ]) {
      expect(MEASURE_REASONS[reason]).toBeDefined();
    }
  });

  it("keeps a name for each certainty the catalogue actually uses", () => {
    const used = new Set(CRITERION_IDS.map((id) => FISCAL_CRITERIA[id].certainty));
    for (const certainty of used) {
      expect(CERTAINTY_LABELS[certainty]).toBeDefined();
    }
  });
});
