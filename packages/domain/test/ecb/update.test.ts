// An update never overwrites the past in silence (ADR-0029, point 2; decision
// (o) of prompt 012). Mutants 6 and 10.

import { describe, expect, it } from "vitest";
import { readEcbZipCsv } from "../../src/ecb/history.js";
import { checkHistoryUpdate } from "../../src/ecb/update.js";
import { ecbFixture } from "../fixtures-path.js";

const text = ecbFixture("eurofxref-hist.csv");
const [header, ...rows] = text.trimEnd().split("\n");
const without = (count: number) => `${[header, ...rows.slice(count)].join("\n")}\n`;

describe("checkHistoryUpdate", () => {
  it("accepts the first download whole", () => {
    const next = readEcbZipCsv(text);
    expect(checkHistoryUpdate(undefined, next)).toEqual({
      kind: "accepted",
      newDays: 127,
      latest: "2026-03-31",
    });
  });

  it("accepts a history that keeps every rate and adds days, and says how many", () => {
    const previous = readEcbZipCsv(without(3));
    expect(checkHistoryUpdate(previous, readEcbZipCsv(text))).toEqual({
      kind: "accepted",
      newDays: 3,
      latest: "2026-03-31",
    });
  });

  it("takes 0.85950 for 0.8595: the comparison is numeric", () => {
    const previous = readEcbZipCsv(text);
    const padded = readEcbZipCsv(text.replace(",0.8595,", ",0.85950,"));
    expect(checkHistoryUpdate(previous, padded)).toMatchObject({ kind: "accepted", newDays: 0 });
  });

  it("refuses a history that changes or drops a published rate, and says which", () => {
    const previous = readEcbZipCsv(text);
    const changed = readEcbZipCsv(text.replace(",0.8595,", ",0.8596,"));
    expect(checkHistoryUpdate(previous, changed)).toEqual({
      kind: "rejected",
      total: 1,
      conflicts: [{ currency: "GBP", date: "2026-01-05", before: "0.8595", after: "0.8596" }],
    });
    const dropped = checkHistoryUpdate(
      previous,
      readEcbZipCsv(without(0).replace(/^2026-03-31.*\n/m, "")),
    );
    expect(dropped).toMatchObject({ kind: "rejected" });
    if (dropped.kind === "rejected") {
      expect(dropped.total).toBe(5); // USD, JPY, GBP, CHF and ISK of the last day
      expect(dropped.conflicts.every((conflict) => conflict.after === undefined)).toBe(true);
    }
  });

  it("shows twenty conflicts at most, by date, and counts them all", () => {
    const previous = readEcbZipCsv(text);
    const shifted = readEcbZipCsv(`${[header, ...rows.slice(40)].join("\n")}\n`);
    const result = checkHistoryUpdate(previous, shifted);
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.total).toBeGreaterThan(20);
      expect(result.conflicts).toHaveLength(20);
      const dates = result.conflicts.map((conflict) => conflict.date);
      expect(dates).toEqual([...dates].sort());
    }
  });
});
