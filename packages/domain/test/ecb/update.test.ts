// An update never overwrites the past in silence (ADR-0029, point 2).

import { describe, expect, it } from "vitest";
import { readEcbZipCsv } from "../../src/ecb/history.js";
import { checkHistoryUpdate } from "../../src/ecb/update.js";
import { ecbFixture } from "../fixtures-path.js";

/** After the last day of the fixture (2026-03-31). */
const TODAY = "2026-04-15";
const text = ecbFixture("eurofxref-hist.csv");
const [header, ...rows] = text.trimEnd().split("\n");
const without = (count: number) => `${[header, ...rows.slice(count)].join("\n")}\n`;

describe("checkHistoryUpdate", () => {
  it("accepts the first download whole", () => {
    const next = readEcbZipCsv(text);
    expect(checkHistoryUpdate(undefined, next, TODAY)).toEqual({
      kind: "accepted",
      newDays: 127,
      latest: "2026-03-31",
      backfilled: 0,
    });
  });

  it("accepts a history that keeps every rate and adds days, and says how many", () => {
    const previous = readEcbZipCsv(without(3));
    expect(checkHistoryUpdate(previous, readEcbZipCsv(text), TODAY)).toEqual({
      kind: "accepted",
      newDays: 3,
      latest: "2026-03-31",
      backfilled: 0,
    });
  });

  it("accepts a past day the previous history lacked, and counts its rates", () => {
    // The previous history lacks its second row; the new one has it back.
    const previous = readEcbZipCsv(`${[header, rows[0], ...rows.slice(2)].join("\n")}\n`);
    const result = checkHistoryUpdate(previous, readEcbZipCsv(text), TODAY);
    expect(result).toMatchObject({ kind: "accepted", newDays: 0 });
    expect((result as { backfilled: number }).backfilled).toBeGreaterThan(0);
  });

  it("takes 0.85950 for 0.8595: the comparison is numeric", () => {
    const previous = readEcbZipCsv(text);
    const padded = readEcbZipCsv(text.replace(",0.8595,", ",0.85950,"));
    expect(checkHistoryUpdate(previous, padded, TODAY)).toMatchObject({
      kind: "accepted",
      newDays: 0,
    });
  });

  it("refuses a history that changes or drops a published rate, and says which", () => {
    const previous = readEcbZipCsv(text);
    const changed = readEcbZipCsv(text.replace(",0.8595,", ",0.8596,"));
    expect(checkHistoryUpdate(previous, changed, TODAY)).toEqual({
      kind: "rejected",
      total: 1,
      conflicts: [{ currency: "GBP", date: "2026-01-05", before: "0.8595", after: "0.8596" }],
    });
    const dropped = checkHistoryUpdate(
      previous,
      readEcbZipCsv(without(0).replace(/^2026-03-31.*\n/m, "")),
      TODAY,
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
    const result = checkHistoryUpdate(previous, shifted, TODAY);
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.total).toBeGreaterThan(20);
      expect(result.conflicts).toHaveLength(20);
      const dates = result.conflicts.map((conflict) => conflict.date);
      expect(dates).toEqual([...dates].sort());
    }
  });
});

describe("a history from the future", () => {
  it("refuses a publication after today, the first download or not, and accepts today itself", () => {
    const next = readEcbZipCsv(text);
    expect(() => checkHistoryUpdate(undefined, next, "2026-03-30")).toThrow(
      expect.objectContaining({ code: "ecb_history_future", details: { latest: "2026-03-31" } }),
    );
    expect(() => checkHistoryUpdate(readEcbZipCsv(without(1)), next, "2026-03-30")).toThrow(
      expect.objectContaining({ code: "ecb_history_future" }),
    );
    expect(checkHistoryUpdate(undefined, next, "2026-03-31")).toMatchObject({ kind: "accepted" });
  });
});
