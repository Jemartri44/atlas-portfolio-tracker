// What January has to add by hand: the CPI of the year that ended and the sheets over a year old.

import { describe, expect, it } from "vitest";
import { annualUpkeep } from "../../src/jobs/annual-upkeep.js";
import type { IndexTables } from "../../src/projections/index-profiles.js";

const profile = (name: string, as_of?: string) => ({
  key: name,
  name,
  currency: { USD: "100" },
  checked: "2026-11-03",
  ...(as_of === undefined ? {} : { as_of }),
});
const fund = (isin: string, as_of: string) => ({
  isin,
  name: "Fondo Centinela",
  index: "a",
  as_of,
  checked: "2026-11-03",
});

const TABLES: IndexTables = {
  profiles: {
    old: profile("Índice viejo", "2026-01-14"),
    edge: profile("Índice justo", "2026-01-15"),
    fresh: profile("Índice nuevo", "2026-11-02"),
    gold: profile("Sin ficha"),
  },
  funds: {
    a: fund("XS9999999991", "2026-01-14"),
    b: fund("XS9999999992", "2026-01-15"),
  },
  byClass: {},
};

describe("the upkeep of January", () => {
  it("says the CPI of the year when the table does not have it", () => {
    expect(annualUpkeep(2026, "2027-01-15", {}, TABLES).missingCpi).toBe(2026);
    expect(annualUpkeep(2026, "2027-01-15", { "2026": {} }, TABLES)).not.toHaveProperty(
      "missingCpi",
    );
  });

  it("names the profiles read more than a year ago, and only counts the funds", () => {
    const upkeep = annualUpkeep(2026, "2027-01-15", {}, TABLES);
    expect(upkeep.staleProfiles).toEqual(["Índice viejo"]);
    expect(upkeep.staleFunds).toBe(1);
    expect(JSON.stringify(upkeep)).not.toContain("Centinela");
  });

  it("reads the real tables by default: the CPI of 2025 is there, that of 2026 is not", () => {
    expect(annualUpkeep(2025, "2026-11-03")).toEqual({ staleProfiles: [], staleFunds: 0 });
    expect(annualUpkeep(2026, "2027-01-02").missingCpi).toBe(2026);
  });
});
