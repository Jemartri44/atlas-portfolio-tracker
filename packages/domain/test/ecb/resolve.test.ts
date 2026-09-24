// Which rate applies (ADR-0029, point 5), over the synthetic history:
// publications from 2025-10-01 to 2026-03-31 (a Tuesday), without 25-26
// December and 1 January; the lev stops at 2025-12-31.

import { describe, expect, it } from "vitest";
import { readEcbZipCsv } from "../../src/ecb/history.js";
import { isDecided, resolveRate } from "../../src/ecb/resolve.js";
import { ecbFixture } from "../fixtures-path.js";

const history = readEcbZipCsv(ecbFixture("eurofxref-hist.csv"));
const resolve = (currency: string, date: string, stale = 30) =>
  resolveRate(history, currency, date, stale);

describe("resolveRate", () => {
  it("takes the day itself when there was a publication", () => {
    expect(resolve("GBP", "2026-01-05")).toEqual({
      kind: "resolved",
      currency: "GBP",
      rate: "0.8595",
      date: "2026-01-05",
    });
  });

  it("takes the last one before on a weekend or a holiday already followed by a publication", () => {
    expect(resolve("USD", "2026-01-04")).toMatchObject({ kind: "resolved", date: "2026-01-02" });
    expect(resolve("USD", "2025-12-26")).toMatchObject({ kind: "resolved", date: "2025-12-24" });
    expect(resolve("USD", "2026-01-01")).toMatchObject({ kind: "resolved", date: "2025-12-31" });
  });

  it("never resolves a working day the history does not reach yet (mutant 8)", () => {
    // 2026-04-01 is a Wednesday after the last publication: it may still come.
    expect(resolve("USD", "2026-04-01")).toEqual({
      kind: "not_yet_published",
      currency: "USD",
      latest: "2026-03-31",
    });
    expect(isDecided(history, "2026-03-31")).toBe(true);
    expect(isDecided(history, "2026-04-01")).toBe(false);
  });

  it("does resolve a weekend right after the last publication", () => {
    // Last publication on a Tuesday; the Saturday and Sunday after a Friday
    // that was published are known: here, 2026-03-28/29 follow Friday the 27th.
    expect(resolve("USD", "2026-03-29")).toMatchObject({ kind: "resolved", date: "2026-03-27" });
  });

  it("says the ECB does not publish a currency, or did not yet on that day", () => {
    expect(resolve("XAU", "2026-01-05")).toEqual({
      kind: "currency_not_published",
      currency: "XAU",
    });
    expect(resolve("CYP", "2026-01-05")).toEqual({
      kind: "currency_not_published",
      currency: "CYP",
    });
    expect(resolve("USD", "2025-09-15")).toEqual({
      kind: "currency_not_published",
      currency: "USD",
    });
  });

  it("has nothing to propose for a currency the ECB stopped publishing", () => {
    // Two days after the last value: still resolved (ADR-0029, the last date ≤ F).
    expect(resolve("BGN", "2026-01-02")).toMatchObject({ kind: "resolved", date: "2025-12-31" });
    // Past the threshold, it is stale — and stays so even on a day the history does not reach.
    expect(resolve("BGN", "2026-02-02")).toEqual({
      kind: "currency_stale",
      currency: "BGN",
      last: "2025-12-31",
    });
    expect(resolve("BGN", "2026-06-01")).toMatchObject({ kind: "currency_stale" });
    // The threshold is the configured one.
    expect(resolve("BGN", "2026-02-02", 60)).toMatchObject({
      kind: "resolved",
      date: "2025-12-31",
    });
  });

  it("calls stale a gap longer than the threshold even while the currency is still published", () => {
    expect(resolve("USD", "2025-10-20", 1)).toMatchObject({ kind: "resolved" });
    expect(resolve("USD", "2025-10-05", 1)).toMatchObject({
      kind: "currency_stale",
      last: "2025-10-03",
    });
  });

  it("never makes the euro wait", () => {
    expect(resolve("EUR", "2026-06-06")).toEqual({ kind: "euro", rate: "1", date: "2026-06-05" });
    expect(resolve("EUR", "2026-06-03")).toEqual({ kind: "euro", rate: "1", date: "2026-06-03" });
  });
});
