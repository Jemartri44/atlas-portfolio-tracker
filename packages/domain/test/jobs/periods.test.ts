// Feature 016, E1 (R11, §8.1 P15): the periods of the jobs in Europe/Madrid,
// with their borders: the changes of time, the end of a month, New Year's Eve.

import { describe, expect, it } from "vitest";
import { madridDateOf } from "../../src/dates/madrid.js";
import { inWindow, isoWeekday, periodOf, previousPeriod } from "../../src/jobs/periods.js";

const at = (iso: string) => madridDateOf(new Date(iso));

describe("the period of a job, of Europe/Madrid (R11)", () => {
  it("is still December and the old year at 23:30 of the 31st in Madrid (22:30 UTC)", () => {
    const today = at("2026-12-31T22:30:00Z");
    expect(today).toBe("2026-12-31");
    expect(periodOf("monthly", today)).toBe("2026-12");
    expect(periodOf("quarterly", today)).toBe("2026-Q4");
    expect(periodOf("yearly", today)).toBe("2026");
  });

  it("is January and the new year at 00:30 of the 1st in Madrid (23:30 UTC of the 31st)", () => {
    const today = at("2026-12-31T23:30:00Z");
    expect(today).toBe("2027-01-01");
    expect(periodOf("monthly", today)).toBe("2027-01");
    expect(periodOf("quarterly", today)).toBe("2027-Q1");
    expect(periodOf("yearly", today)).toBe("2027");
    expect(periodOf("daily", today)).toBe("2027-01-01");
  });

  it("moves with the changes of time of March and October", () => {
    // 29 March 2026: 01:00 UTC is 03:00 in Madrid; the day before at 22:59 UTC is 23:59 CET.
    expect(at("2026-03-28T22:59:00Z")).toBe("2026-03-28");
    expect(at("2026-03-28T23:00:00Z")).toBe("2026-03-29");
    // 25 October 2026: at 22:00 UTC of the 24th it is midnight CEST.
    expect(at("2026-10-24T21:59:00Z")).toBe("2026-10-24");
    expect(at("2026-10-24T22:00:00Z")).toBe("2026-10-25");
    expect(at("2026-10-25T22:59:00Z")).toBe("2026-10-25");
    expect(at("2026-10-25T23:00:00Z")).toBe("2026-10-26");
  });

  it("names the ISO week by its Thursday, across the end of a year", () => {
    expect(isoWeekday("2026-10-05")).toBe(1);
    expect(isoWeekday("2026-10-11")).toBe(7);
    expect(periodOf("weekly", "2026-10-05")).toBe("2026-W41");
    expect(periodOf("weekly", "2026-10-11")).toBe("2026-W41");
    expect(periodOf("weekly", "2026-12-31")).toBe("2026-W53");
    expect(periodOf("weekly", "2027-01-03")).toBe("2026-W53");
    expect(periodOf("weekly", "2027-01-04")).toBe("2027-W01");
    expect(periodOf("weekly", "2025-12-29")).toBe("2026-W01");
  });

  it("gives the period before, at every frequency, across month and year ends", () => {
    expect(previousPeriod("daily", "2027-01-01")).toBe("2026-12-31");
    expect(previousPeriod("daily", "2026-03-01")).toBe("2026-02-28");
    expect(previousPeriod("weekly", "2027-01-04")).toBe("2026-W53");
    expect(previousPeriod("weekly", "2026-10-07")).toBe("2026-W40");
    expect(previousPeriod("monthly", "2027-01-15")).toBe("2026-12");
    expect(previousPeriod("monthly", "2026-10-31")).toBe("2026-09");
    expect(previousPeriod("quarterly", "2027-02-10")).toBe("2026-Q4");
    expect(previousPeriod("quarterly", "2026-08-31")).toBe("2026-Q2");
    expect(previousPeriod("yearly", "2027-01-01")).toBe("2026");
  });

  it("lets a yearly job run only in January, and every other job any day", () => {
    expect(inWindow("yearly", "2027-01-31")).toBe(true);
    expect(inWindow("yearly", "2027-02-01")).toBe(false);
    expect(inWindow("yearly", "2026-12-31")).toBe(false);
    expect(inWindow("monthly", "2026-12-31")).toBe(true);
  });
});
