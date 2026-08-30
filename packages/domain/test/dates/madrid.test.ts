import { describe, expect, it } from "vitest";
import { madridDateOf, todayInMadrid } from "../../src/dates/madrid.js";
import { ValidationError } from "../../src/errors.js";

describe("madridDateOf", () => {
  it("moves late UTC instants to the next day in summer (UTC+2) and winter (UTC+1)", () => {
    expect(madridDateOf("2026-08-30T21:59:59Z")).toBe("2026-08-30");
    expect(madridDateOf("2026-08-30T22:30:00Z")).toBe("2026-08-31");
    expect(madridDateOf("2026-12-30T22:30:00Z")).toBe("2026-12-30");
    expect(madridDateOf("2026-12-30T23:30:00Z")).toBe("2026-12-31");
  });

  it("follows the daylight-saving switches of March and October", () => {
    expect(madridDateOf("2026-03-28T22:30:00Z")).toBe("2026-03-28");
    expect(madridDateOf("2026-03-29T22:30:00Z")).toBe("2026-03-30");
    expect(madridDateOf("2026-10-24T22:30:00Z")).toBe("2026-10-25");
    expect(madridDateOf("2026-10-25T22:30:00Z")).toBe("2026-10-25");
  });

  it("accepts Date objects and rejects invalid instants", () => {
    expect(madridDateOf(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
    expect(() => madridDateOf("not a date")).toThrow(ValidationError);
    expect(todayInMadrid({ now: () => new Date("2026-08-30T23:00:00Z") })).toBe("2026-08-31");
  });
});
