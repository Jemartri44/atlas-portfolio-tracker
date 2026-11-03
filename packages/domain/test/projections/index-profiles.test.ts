import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import {
  fundSourceOf,
  INDEX_BY_CLASS,
  INDEX_PROFILES,
  indexSourceOf,
  KNOWN_FUNDS,
} from "../../src/projections/index-profiles.js";

const sum = (split: Readonly<Record<string, string>>) =>
  Object.values(split)
    .reduce((acc, pct) => acc.add(Decimal.parse(pct)), Decimal.parse("0"))
    .toString();

describe("the index profiles", () => {
  it.each(Object.values(INDEX_PROFILES))(
    "$key: each split adds up to exactly 100 and its keys are well formed",
    (profile) => {
      expect(sum(profile.currency)).toBe("100");
      expect(Object.keys(profile.currency).every((k) => /^[A-Z]{3}$/.test(k))).toBe(true);
      if (profile.region !== undefined) {
        expect(sum(profile.region)).toBe("100");
        const closed = [
          "north_america",
          "europe_developed",
          "asia_pacific_developed",
          "emerging",
          "global",
          "other",
        ];
        expect(Object.keys(profile.region).every((k) => closed.includes(k))).toBe(true);
      }
    },
  );

  it("states where each figure was read: a fund and a date, or a definition with neither", () => {
    for (const profile of Object.values(INDEX_PROFILES)) {
      expect(profile.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(profile.as_of === undefined).toBe(profile.via === undefined);
      if (profile.via !== undefined) {
        expect(profile.via.isin).toMatch(/^[A-Z]{2}[A-Z0-9]{9}\d$/);
        expect(indexSourceOf(profile.key)).toMatch(/^https:\/\//);
        expect(indexSourceOf(profile.key)).toContain(
          profile.via.isin === "IE00BFPM9W02" ? "Euro_Government" : "holdings-daily",
        );
      } else {
        expect(indexSourceOf(profile.key)).toBeUndefined();
      }
    }
    expect(indexSourceOf("not_a_profile")).toBeUndefined();
  });

  it("proposes by class only a profile that exists, and by fund only one the table has", () => {
    for (const key of Object.values(INDEX_BY_CLASS)) {
      expect(INDEX_PROFILES[key]).toBeDefined();
    }
    for (const fund of Object.values(KNOWN_FUNDS)) {
      expect(INDEX_PROFILES[fund.index]).toBeDefined();
      expect(fund.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("lists each known fund with the page of its manager, and none that is not listed", () => {
    expect(Object.keys(KNOWN_FUNDS).length).toBeGreaterThan(0);
    for (const fund of Object.values(KNOWN_FUNDS)) {
      expect(fundSourceOf(fund.isin)).toMatch(/^https:\/\/www\.vanguard\.co\.uk\//);
    }
    expect(fundSourceOf("IE0000000000")).toBeUndefined();
  });

  it("gives no region where no source does (money market) and a euro hedge is all EUR", () => {
    expect(INDEX_PROFILES.money_market_eur?.region).toBeUndefined();
    expect(INDEX_PROFILES.global_agg_eur_hedged?.currency).toEqual({ EUR: "100" });
  });
});
