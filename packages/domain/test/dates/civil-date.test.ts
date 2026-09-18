import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addYears,
  assertCivilDate,
  compareCivilDates,
  daysBetween,
  daysInMonth,
  isCivilDate,
  isLeapYear,
  isWeekend,
  yearOf,
} from "../../src/dates/civil-date.js";
import { ValidationError } from "../../src/errors.js";

describe("civil dates", () => {
  it("knows leap years", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2023, 4)).toBe(30);
  });

  it("validates the calendar, not only the pattern", () => {
    expect(isCivilDate("2026-08-30")).toBe(true);
    expect(isCivilDate("2024-02-29")).toBe(true);
    expect(isCivilDate("2023-02-29")).toBe(false);
    expect(isCivilDate("2026-13-01")).toBe(false);
    expect(isCivilDate("2026-00-10")).toBe(false);
    expect(isCivilDate("2026-04-31")).toBe(false);
    expect(isCivilDate("2026-04-00")).toBe(false);
    expect(isCivilDate("2026-1-1")).toBe(false);
    expect(isCivilDate("2026-08-30T00:00:00Z")).toBe(false);
    expect(isCivilDate(20260830)).toBe(false);
  });

  it("asserts with the field name in the error", () => {
    expect(assertCivilDate("2026-08-30", "trade_date")).toBe("2026-08-30");
    expect(() => assertCivilDate("30/08/2026", "trade_date")).toThrow(ValidationError);
  });

  it("compares chronologically and extracts the year", () => {
    expect(compareCivilDates("2026-12-30", "2027-01-02")).toBe(-1);
    expect(compareCivilDates("2027-01-02", "2026-12-30")).toBe(1);
    expect(compareCivilDates("2026-12-30", "2026-12-30")).toBe(0);
    expect(yearOf("2026-12-30")).toBe(2026);
  });

  it("counts days between dates, across months, years and leap days", () => {
    expect(daysBetween("2026-08-30", "2026-08-30")).toBe(0);
    expect(daysBetween("2026-08-30", "2026-09-01")).toBe(2);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2023-02-28", "2023-03-01")).toBe(1);
    expect(daysBetween("2027-01-02", "2026-12-30")).toBe(-3);
  });

  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-08-30", 2)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2023-02-28", 1)).toBe("2023-03-01");
    expect(addDays("2027-01-02", -3)).toBe("2026-12-30");
    expect(addDays("2026-08-30", 0)).toBe("2026-08-30");
  });

  it("knows which days the ECB does not publish", () => {
    // 2026-08-31 is a Monday.
    expect(isWeekend("2026-08-31")).toBe(false);
    expect(isWeekend("2026-09-04")).toBe(false); // Friday
    expect(isWeekend("2026-09-05")).toBe(true); // Saturday
    expect(isWeekend("2026-09-06")).toBe(true); // Sunday
    expect(isWeekend("2026-09-07")).toBe(false); // Monday
    expect(isWeekend("1970-01-01")).toBe(false); // Thursday, the epoch itself
    expect(isWeekend("1969-12-28")).toBe(true); // Sunday before the epoch
  });
});

/**
 * The arithmetic of the wash-sale window (ADR-0014): date to date in whole
 * months and years, never a fixed number of days. 61 days are not two months,
 * and getting this wrong costs a deferred loss.
 */
describe("addMonths / addYears", () => {
  it("counts whole months and clamps a day the target month does not have", () => {
    expect(addMonths("2027-01-15", 2)).toBe("2027-03-15");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2027-01-31", 3)).toBe("2027-04-30");
    expect(addMonths("2027-11-30", 2)).toBe("2028-01-30");
  });

  it("walks backwards too, which is the other half of the window", () => {
    expect(addMonths("2027-03-15", -2)).toBe("2027-01-15");
    expect(addMonths("2027-01-15", -1)).toBe("2026-12-15");
    expect(addMonths("2027-03-31", -1)).toBe("2027-02-28");
    expect(addMonths("2027-01-31", -13)).toBe("2025-12-31");
  });

  it("adds years with the leap day clamped", () => {
    expect(addYears("2027-06-30", 1)).toBe("2028-06-30");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
    expect(addYears("2028-02-29", -1)).toBe("2027-02-28");
    expect(addYears("2027-01-15", 0)).toBe("2027-01-15");
  });
});
