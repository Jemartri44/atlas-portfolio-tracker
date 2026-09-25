import { describe, expect, it } from "vitest";
import {
  applyOutcomes,
  EMPTY_STATUS,
  failingSources,
  lastMarketDayBefore,
  parseStatus,
  reserveCall,
  serializeStatus,
  spentAt,
  withAssetFailures,
} from "../../src/quotes/status.js";

const at = (iso: string) => new Date(iso);

describe("prices/_status.json", () => {
  it("without a file is empty; it reads back what it writes", () => {
    expect(parseStatus(undefined)).toEqual(EMPTY_STATUS);
    const status = reserveCall(EMPTY_STATUS, "eodhd", 20, at("2027-01-05T10:00:00Z"));
    expect(parseStatus(serializeStatus(status ?? EMPTY_STATUS))).toEqual(status);
  });

  it("refuses a status it does not read, instead of giving back the calls spent", () => {
    for (const text of [
      "x",
      '{"status_format":2}',
      '{"status_format":1,"sources":[],"assets":{}}',
      '{"status_format":1,"sources":{},"assets":[]}',
      '{"status_format":1,"sources":{"yahoo":{"consecutive_failures":0,"calls_at":[]}},"assets":{}}',
      '{"status_format":1,"sources":{"eodhd":1},"assets":{}}',
      '{"status_format":1,"sources":{"eodhd":{"consecutive_failures":"0","calls_at":[]}},"assets":{}}',
      '{"status_format":1,"sources":{"eodhd":{"consecutive_failures":0,"calls_at":{}}},"assets":{}}',
      '{"status_format":1,"sources":{"eodhd":{"consecutive_failures":0,"calls_at":[1]}},"assets":{}}',
    ]) {
      expect(() => parseStatus(text), text).toThrow(
        expect.objectContaining({ code: "invalid_price_status" }),
      );
    }
  });
});

describe("the budget of calls (D-Q3)", () => {
  it("counts EODHD by day GMT, and never lets a reservation go over the limit", () => {
    let status = EMPTY_STATUS;
    for (let i = 0; i < 2; i += 1) {
      status = reserveCall(status, "eodhd", 2, at("2027-01-05T23:30:00Z")) ?? status;
    }
    expect(spentAt(status, "eodhd", at("2027-01-05T23:59:00Z"))).toBe(2);
    expect(reserveCall(status, "eodhd", 2, at("2027-01-05T23:59:00Z"))).toBeUndefined();
    // Midnight GMT: a new day, even if Madrid is still on the 6th either way.
    expect(spentAt(status, "eodhd", at("2027-01-06T00:00:01Z"))).toBe(0);
    expect(reserveCall(status, "eodhd", 2, at("2027-01-06T00:00:01Z"))).toBeDefined();
  });

  it("counts Alpha Vantage over a rolling window of 24 hours, whatever its reset", () => {
    const status =
      reserveCall(EMPTY_STATUS, "alpha_vantage", 1, at("2027-01-05T23:30:00Z")) ?? EMPTY_STATUS;
    expect(reserveCall(status, "alpha_vantage", 1, at("2027-01-06T00:30:00Z"))).toBeUndefined();
    expect(spentAt(status, "alpha_vantage", at("2027-01-06T23:29:59Z"))).toBe(1);
    expect(reserveCall(status, "alpha_vantage", 1, at("2027-01-06T23:30:00Z"))).toBeDefined();
  });

  it("drops calls older than two days when it reserves", () => {
    const old = reserveCall(EMPTY_STATUS, "eodhd", 5, at("2027-01-01T10:00:00Z")) ?? EMPTY_STATUS;
    const next = reserveCall(old, "eodhd", 5, at("2027-01-05T10:00:00Z"));
    expect(next?.sources.eodhd?.calls_at).toEqual(["2027-01-05T10:00:00.000Z"]);
  });
});

describe("the failures of a source", () => {
  it("counts only what speaks of the source, and a success puts it back to zero", () => {
    const t = "2027-01-05T10:00:00.000Z";
    let status = applyOutcomes(EMPTY_STATUS, [
      { source: "eodhd", at: t, ok: false, kind: "unavailable" },
      { source: "eodhd", at: t, ok: false, kind: "not_found" },
      { source: "eodhd", at: t, ok: false, kind: "blocked" },
      { source: "eodhd", at: t, ok: false, kind: "budget_exhausted" },
      { source: "alpha_vantage", at: t, ok: false, kind: "rate_limited" },
    ]);
    expect(status.sources.eodhd).toMatchObject({
      consecutive_failures: 2,
      last_failure: { kind: "budget_exhausted", at: t },
    });
    expect(failingSources(status, 2)).toEqual(["eodhd"]);
    expect(failingSources(status, 1)).toEqual(["eodhd", "alpha_vantage"]);
    status = applyOutcomes(status, [{ source: "eodhd", at: t, ok: true }]);
    expect(status.sources.eodhd).toMatchObject({ consecutive_failures: 0, last_success: t });
    expect(failingSources(status, 2)).toEqual([]);
  });

  it("records and clears the last failure of an asset", () => {
    const failure = {
      kind: "currency_mismatch",
      source: "eodhd",
      at: "x",
      declared: "GBX",
      found: "GBP",
    } as const;
    const set = withAssetFailures(EMPTY_STATUS, new Map([["ast_a", failure]]));
    expect(set.assets.ast_a?.last_failure).toEqual(failure);
    expect(withAssetFailures(set, new Map([["ast_a", undefined]])).assets).toEqual({});
  });
});

describe("the last market day before today", () => {
  it("skips the weekend", () => {
    expect(lastMarketDayBefore("2027-01-06")).toBe("2027-01-05"); // Wednesday → Tuesday
    expect(lastMarketDayBefore("2027-01-04")).toBe("2027-01-01"); // Monday → Friday
    expect(lastMarketDayBefore("2027-01-03")).toBe("2027-01-01"); // Sunday → Friday
  });
});
