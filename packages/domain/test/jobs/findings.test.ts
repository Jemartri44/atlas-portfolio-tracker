// Feature 016, E2 (§8.2 B1, B2; mutants 18 and 18 bis): what the ECB and the
// prices leave for the mail, with codes and subjects of the closed lists and
// counts only.

import { describe, expect, it } from "vitest";
import { ecbFindings, PRODUCER_FINDINGS, pricesFindings } from "../../src/jobs/findings.js";
import { ownFindings } from "../../src/jobs/notices.js";
import type { UpdateReport } from "../../src/quotes/cascade.js";
import { EMPTY_STATUS } from "../../src/quotes/status.js";

const REPORT: UpdateReport = { no_sources: false, assets: [], remaining: {}, failing: [] };

describe("the findings of the ECB", () => {
  it("says a rejected update with how many rates it would overwrite, and a calendar in disagreement", () => {
    const stored = {
      file: "eurofxref-hist.csv",
      source: "zip" as const,
      url: "u",
      fetched_at: "t",
      sha256: "s",
    };
    expect(
      ecbFindings({ kind: "rejected", kept: stored, active: stored, conflicts: [], total: 3 }),
    ).toEqual([{ code: "ecb_update_rejected", subject: "ecb", counts: { conflicts: 3 } }]);
    expect(
      ecbFindings({ kind: "accepted", stored, newDays: 1, latest: "2026-10-02", calendar: [] }),
    ).toEqual([]);
    expect(
      ecbFindings({
        kind: "accepted",
        stored,
        newDays: 1,
        latest: "2026-10-02",
        calendar: [
          { date: "2026-10-01", kind: "working_day_without_publication" },
          { date: "2026-12-25", kind: "closing_day_with_publication" },
        ],
      }),
    ).toEqual([{ code: "ecb_calendar_mismatch", subject: "ecb", counts: { days: 2 } }]);
  });
});

describe("the findings of the prices", () => {
  it("says each failing source with its streak and threshold, from the status", () => {
    const status = {
      ...EMPTY_STATUS,
      sources: {
        eodhd: { consecutive_failures: 4, calls_at: [] },
        alpha_vantage: { consecutive_failures: 1, calls_at: [] },
      },
    };
    expect(
      pricesFindings({
        report: { ...REPORT, failing: ["alpha_vantage", "eodhd"] },
        status,
        threshold: 3,
        theses: 0,
      }),
    ).toEqual([
      {
        code: "source_failing",
        subject: "eodhd",
        counts: { consecutive_failures: 4, threshold: 3 },
      },
      {
        code: "source_failing",
        subject: "alpha_vantage",
        counts: { consecutive_failures: 1, threshold: 3 },
      },
    ]);
    expect(
      pricesFindings({
        report: { ...REPORT, failing: ["eodhd"] },
        status: EMPTY_STATUS,
        threshold: 3,
        theses: 0,
      }),
    ).toEqual([
      {
        code: "source_failing",
        subject: "eodhd",
        counts: { consecutive_failures: 0, threshold: 3 },
      },
    ]);
  });

  it("counts the assets left unchecked by source, and the theses past their horizon", () => {
    const asset = (id: string, unchecked?: readonly ("eodhd" | "alpha_vantage")[]) => ({
      asset_id: id,
      group: "core" as const,
      outcome: "currency_unchecked" as const,
      added: 0,
      failures: [],
      ...(unchecked === undefined ? {} : { unchecked }),
    });
    expect(
      pricesFindings({
        report: {
          ...REPORT,
          assets: [asset("a", ["eodhd"]), asset("b", ["eodhd", "alpha_vantage"]), asset("c")],
        },
        status: EMPTY_STATUS,
        threshold: 3,
        theses: 2,
      }),
    ).toEqual([
      { code: "currency_unchecked", subject: "eodhd", counts: { assets: 2 } },
      { code: "currency_unchecked", subject: "alpha_vantage", counts: { assets: 1 } },
      { code: "thesis_horizon_exceeded", subject: "bucket", counts: { theses: 2 } },
    ]);
    expect(
      pricesFindings({ report: REPORT, status: EMPTY_STATUS, threshold: 3, theses: 0 }),
    ).toEqual([]);
  });

  it("leaves only findings its producer may say, whose subjects are closed lists", () => {
    const findings = pricesFindings({
      report: { ...REPORT, failing: ["eodhd"] },
      status: EMPTY_STATUS,
      threshold: 3,
      theses: 1,
    });
    expect(ownFindings("prices_update", findings, PRODUCER_FINDINGS)).toEqual(findings);
    expect(ownFindings("ecb_update", findings, PRODUCER_FINDINGS)).toEqual([]);
    for (const subjects of Object.values(PRODUCER_FINDINGS).flatMap((codes) =>
      Object.values(codes ?? {}),
    )) {
      for (const subject of subjects) {
        expect(["ecb", "eodhd", "alpha_vantage", "bucket"]).toContain(subject);
      }
    }
  });
});
