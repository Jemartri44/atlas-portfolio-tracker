// Feature 016, E2 (§8.2 B1, B2; mutants 18 and 18 bis): what the ECB and the
// prices leave for the mail, with codes and subjects of the closed lists and
// counts only.

import { describe, expect, it } from "vitest";
import { backupFindings } from "../../src/jobs/backup.js";
import { ecbFindings, PRODUCER_FINDINGS, pricesFindings } from "../../src/jobs/findings.js";
import { integrityFindings } from "../../src/jobs/integrity.js";
import { ownFindings } from "../../src/jobs/notices.js";
import type { UpdateReport } from "../../src/quotes/cascade.js";
import { EMPTY_STATUS } from "../../src/quotes/status.js";

const REPORT: UpdateReport = { no_sources: false, assets: [], remaining: {}, failing: [] };

describe("the findings of the ECB", () => {
  const stored = {
    file: "eurofxref-hist.csv",
    source: "zip" as const,
    url: "u",
    fetched_at: "t",
    sha256: "s",
  };

  it("says an update cut halfway and undone, before what the update of the day found (R2-N1)", () => {
    const stored = { source: "zip", sha256: "a".repeat(64) } as never;
    expect(
      ecbFindings(
        { kind: "accepted", stored, newDays: 1, latest: "2026-10-02", calendar: [] },
        { undone: true },
      ),
    ).toEqual([{ code: "ecb_update_undone", subject: "ecb" }]);
    expect(
      ecbFindings(
        { kind: "rejected", kept: stored, active: stored, conflicts: [], total: 3 },
        { undone: true },
      ),
    ).toEqual([
      { code: "ecb_update_undone", subject: "ecb" },
      { code: "ecb_update_rejected", subject: "ecb", counts: { conflicts: 3 } },
    ]);
    expect(
      ownFindings("ecb_update", [{ code: "ecb_update_undone", subject: "ecb" }], PRODUCER_FINDINGS),
    ).toEqual([{ code: "ecb_update_undone", subject: "ecb" }]);
  });

  it("says a rejected update with how many rates it would overwrite, and a calendar in disagreement", () => {
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

  it("says a rebuild of a damaged history with its days, and the damage when there was no ZIP", () => {
    expect(ecbFindings({ kind: "zip_unavailable" })).toEqual([
      { code: "ecb_history_damaged", subject: "ecb" },
    ]);
    expect(
      ecbFindings({
        kind: "rebuilt",
        stored,
        days: 7100,
        latest: "2026-10-02",
        calendar: [],
        verified: true,
      }),
    ).toEqual([{ code: "ecb_history_rebuilt", subject: "ecb", counts: { days: 7100 } }]);
    expect(
      ecbFindings({
        kind: "rebuilt",
        stored,
        days: 7100,
        latest: "2026-10-02",
        calendar: [{ date: "2026-10-01", kind: "working_day_without_publication" }],
        verified: false,
      }),
    ).toEqual([
      { code: "ecb_history_rebuilt", subject: "ecb", counts: { days: 7100 } },
      { code: "ecb_rebuilt_unverified", subject: "ecb" },
      { code: "ecb_calendar_mismatch", subject: "ecb", counts: { days: 1 } },
    ]);
    // A ZIP that contradicts the last readable generation asks for someone (R2-N1).
    expect(ecbFindings({ kind: "rejected", conflicts: [], total: 3 })).toEqual([
      { code: "ecb_history_damaged", subject: "ecb", counts: { conflicts: 3 } },
    ]);
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

  it("says files of closes that do not read, by how many and never by asset (round 3 of the review of PR #106)", () => {
    const unreadable = (id: string) => ({
      asset_id: id,
      group: "core" as const,
      outcome: "unreadable" as const,
      added: 0,
      failures: [],
    });
    const findings = pricesFindings({
      report: { ...REPORT, assets: [unreadable("IE00B4L5Y983"), unreadable("ast_world")] },
      status: EMPTY_STATUS,
      threshold: 3,
      theses: 0,
    });
    expect(findings).toEqual([
      { code: "prices_file_unreadable", subject: "prices", counts: { files: 2 } },
    ]);
    expect(JSON.stringify(findings)).not.toContain("IE00B4L5Y983");
    expect(JSON.stringify(findings)).not.toContain("ast_world");
    expect(ownFindings("prices_update", findings, PRODUCER_FINDINGS)).toEqual(findings);
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
        expect([
          "ecb",
          "eodhd",
          "alpha_vantage",
          "bucket",
          "prices",
          "backup",
          "integrity",
        ]).toContain(subject);
      }
    }
  });
});

describe("what the dump and the integrity may say (016, E4)", () => {
  it("keeps each producer to its own codes and subjects, and nobody else to them", () => {
    const backup = backupFindings({
      differs: 1,
      ecbInconsistent: true,
      positionsMissing: true,
      ecbMissing: true,
    });
    const integrity = integrityFindings({
      errors: [{ code: "lots_mismatch" }],
      rehearsal: { ok: false, differs: { cash_differ: 1 } },
      size: { bytes: 2048, threshold: 1024 },
    });
    expect(ownFindings("monthly_backup", backup, PRODUCER_FINDINGS)).toEqual(backup);
    expect(ownFindings("quarterly_integrity", integrity, PRODUCER_FINDINGS)).toEqual(integrity);
    expect(ownFindings("monthly_backup", integrity, PRODUCER_FINDINGS)).toEqual([]);
    expect(ownFindings("quarterly_integrity", backup, PRODUCER_FINDINGS)).toEqual([]);
    expect(ownFindings("prices_update", [...backup, ...integrity], PRODUCER_FINDINGS)).toEqual([]);
  });
});
