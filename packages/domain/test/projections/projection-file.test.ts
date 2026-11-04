import { describe, expect, it } from "vitest";
import type { ValidationError } from "../../src/errors.js";
import {
  MAX_PROJECTION_BYTES,
  PROJECTION_START,
  parseProjectionText,
  projectionAssumptions,
  projectionOrNone,
  projectionText,
  validateProjection,
} from "../../src/projections/projection-file.js";

const reasonOf = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return (error as ValidationError).details.reason;
  }
  return undefined;
};
const doc = (rest: Record<string, unknown>) => ({ projection_format: 1, ...rest });

describe("the projection object", () => {
  it("round-trips only what was edited, in one canonical line", () => {
    const edits = { years: 30, classes: { gold: { return_pct: "4" } } };
    const text = projectionText(edits);
    expect(text).toBe('{"projection_format":1,"years":30,"classes":{"gold":{"return_pct":"4"}}}\n');
    expect(parseProjectionText(text)).toEqual(edits);
  });

  it("writes an empty object for a reset", () => {
    expect(projectionText({})).toBe('{"projection_format":1}\n');
  });

  it.each([
    ["format", { projection_format: 2 }],
    ["top_level_key", doc({ goal_eur: "1" })],
    ["years", doc({ years: 0 })],
    ["years", doc({ years: 101 })],
    ["years", doc({ years: 1.5 })],
    ["number", doc({ monthly_eur: 10 })],
    ["number", doc({ monthly_eur: "1e3" })],
    ["range", doc({ monthly_eur: "-1" })],
    ["range", doc({ inflation_pct: "-100" })],
    ["range", doc({ inflation_pct: "1001" })],
    ["range", doc({ commission_pct: "101" })],
    ["format", doc({ classes: [] })],
    ["class", doc({ classes: { cash: {} } })],
    ["class", doc({ classes: { gold: "5" } })],
    ["class_key", doc({ classes: { gold: { low_pct: "1" } } })],
    ["range", doc({ classes: { gold: { return_pct: "-100" } } })],
    ["range", doc({ classes: { gold: { volatility_pct: "-1" } } })],
  ])("refuses with %s", (reason, document) => {
    expect(reasonOf(() => validateProjection(document))).toBe(reason);
  });

  it("refuses a repeated key, what is not JSON and what is too large", () => {
    expect(reasonOf(() => parseProjectionText("{"))).toBe("json");
    expect(reasonOf(() => parseProjectionText('{"projection_format":1,"years":1,"years":2}'))).toBe(
      "repeated_key",
    );
    expect(reasonOf(() => parseProjectionText(" ".repeat(MAX_PROJECTION_BYTES + 1)))).toBe(
      "too_large",
    );
  });

  it("reads a missing or invalid object as no edit, never as a failure", () => {
    expect(projectionOrNone(undefined)).toEqual({});
    expect(projectionOrNone("not json")).toEqual({});
    expect(projectionOrNone('{"projection_format":1,"years":5}\n')).toEqual({ years: 5 });
  });
});

describe("projectionAssumptions", () => {
  it("starts from the published figures, with no commission and the years of the card", () => {
    const start = projectionAssumptions({});
    expect(start.years).toBe(20);
    expect(start.monthlyEur).toBeUndefined();
    expect(start.commissionPct).toBeUndefined();
    expect(start.inflationPct.toString()).toBe("2.2");
    expect(
      Object.entries(start.classes).map(([name, c]) => [
        name,
        c.returnPct.toString(),
        c.volatilityPct.toString(),
        c.lowPct?.toString(),
        c.highPct?.toString(),
      ]),
    ).toEqual([
      ["equity", "7", "15.52", undefined, undefined],
      ["fixed_income", "4.3", "4.64", undefined, undefined],
      ["gold", "5", "16.15", undefined, undefined],
      ["crypto", "10", "55", "-11.2", "16.6"],
    ]);
  });

  it("takes each edit and leaves the rest at the start", () => {
    const edited = projectionAssumptions({
      years: 10,
      monthly_eur: "300",
      inflation_pct: "3",
      commission_pct: "0.1",
      classes: { equity: { return_pct: "6" } },
    });
    expect(edited.years).toBe(10);
    expect(edited.monthlyEur?.toString()).toBe("300");
    expect(edited.inflationPct.toString()).toBe("3");
    expect(edited.commissionPct?.toString()).toBe("0.1");
    expect(edited.classes.equity.returnPct.toString()).toBe("6");
    expect(edited.classes.equity.volatilityPct.toString()).toBe("15.52");
    expect(edited.classes.gold).toBe(PROJECTION_START.classes.gold);
  });

  it("keeps the published cases of crypto when an edit says the same as the start", () => {
    const same = projectionAssumptions({ classes: { crypto: { return_pct: "10.0" } } });
    expect(same.classes.crypto.lowPct?.toString()).toBe("-11.2");
    const other = projectionAssumptions({ classes: { crypto: { return_pct: "9" } } });
    expect(other.classes.crypto.lowPct).toBeUndefined();
    expect(other.classes.crypto.highPct).toBeUndefined();
  });
});
