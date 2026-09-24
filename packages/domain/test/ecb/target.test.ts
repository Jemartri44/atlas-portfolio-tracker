// The TARGET calendar as a cross-check (ADR-0029, point 6, amended by prompt
// 012 (m)). Mutants 11 and 22.

import { describe, expect, it } from "vitest";
import { readEcbZipCsv } from "../../src/ecb/history.js";
import {
  calendarYears,
  crossCheckCalendar,
  easterSunday,
  isTargetClosingDay,
  targetHolidays,
} from "../../src/ecb/target.js";
import { ecbFixture } from "../fixtures-path.js";

describe("the TARGET calendar", () => {
  it("knows Easter and the six closing days", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2000)).toBe("2000-04-23");
    expect(easterSunday(2038)).toBe("2038-04-25");
    expect(targetHolidays(2026)).toEqual([
      "2026-01-01",
      "2026-04-03",
      "2026-04-06",
      "2026-05-01",
      "2026-12-25",
      "2026-12-26",
    ]);
    expect(isTargetClosingDay("2026-04-03")).toBe(true); // Good Friday
    expect(isTargetClosingDay("2026-04-06")).toBe(true); // Easter Monday
    expect(isTargetClosingDay("2026-04-04")).toBe(true); // Saturday
    expect(isTargetClosingDay("2026-04-07")).toBe(false);
  });

  it("compares only the years the ledger uses, or this one and the one before", () => {
    expect(calendarYears("2024-06-03", "2026-09-24")).toEqual([2024, 2025, 2026]);
    expect(calendarYears(undefined, "2026-09-24")).toEqual([2025, 2026]);
    expect(calendarYears("2027-01-04", "2026-09-24")).toEqual([2026]);
  });

  it("agrees with a complete history and finds the day that is missing or too many", () => {
    const text = ecbFixture("eurofxref-hist.csv");
    expect(crossCheckCalendar(readEcbZipCsv(text), [2025, 2026])).toEqual([]);
    const missing = readEcbZipCsv(text.replace(/^2026-01-05.*\n/m, ""));
    expect(crossCheckCalendar(missing, [2026])).toEqual([
      { date: "2026-01-05", kind: "working_day_without_publication" },
    ]);
    const extra = readEcbZipCsv(text.replace(/^(2026-01-02)(.*)\n/m, "$1$2\n2026-01-01$2\n"));
    expect(crossCheckCalendar(extra, [2026])).toEqual([
      { date: "2026-01-01", kind: "closing_day_with_publication" },
    ]);
    // A year the ledger does not use is not looked at, however wrong.
    expect(crossCheckCalendar(missing, [2025])).toEqual([]);
  });
});
