// Whether a date falls in the income tax season (feature 020, E2; Q5,
// answered 2026-09-27). The rule moves out of `informative/attention.ts`, which
// is lazy, to the settings, so the summary places the tax card on its first
// paint: in season, at the top; out of it, a folded row at the end. Both ends
// are included, the date is an argument and nothing reads a clock.

import { describe, expect, it } from "vitest";
import { inRentaSeason } from "../../src/settings/settings.js";

describe("the income tax season", () => {
  it("is the documented default when the settings say nothing, both ends included", () => {
    const settings = {};
    expect(inRentaSeason(settings, "2029-03-31")).toBe(false);
    expect(inRentaSeason(settings, "2029-04-01")).toBe(true);
    expect(inRentaSeason(settings, "2029-06-30")).toBe(true);
    expect(inRentaSeason(settings, "2029-07-01")).toBe(false);
  });

  it("follows the dates the user configured, not the default", () => {
    const settings = { renta_season_start: "03-15", renta_season_end: "05-20" };
    expect(inRentaSeason(settings, "2029-03-14")).toBe(false);
    expect(inRentaSeason(settings, "2029-03-15")).toBe(true);
    expect(inRentaSeason(settings, "2029-05-20")).toBe(true);
    expect(inRentaSeason(settings, "2029-05-21")).toBe(false);
    // Inside the default and outside the configured season: the settings win.
    expect(inRentaSeason(settings, "2029-06-01")).toBe(false);
  });

  it("reads the month and the day of the date, whatever its year", () => {
    expect(inRentaSeason({}, "2031-05-15")).toBe(true);
    expect(inRentaSeason({}, "2031-01-20")).toBe(false);
  });
});
