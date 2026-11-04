import { describe, expect, it } from "vitest";
import { checkHorizon, MAX_HORIZON_YEARS } from "../../src/projections/growth.js";

describe("checkHorizon", () => {
  it.each([0, MAX_HORIZON_YEARS])("takes %i years", (years) => {
    expect(() => checkHorizon(years)).not.toThrow();
  });

  it.each([-1, 1.5, MAX_HORIZON_YEARS + 1])("refuses %d years", (years) => {
    expect(() => checkHorizon(years)).toThrow("whole number of years");
  });
});
