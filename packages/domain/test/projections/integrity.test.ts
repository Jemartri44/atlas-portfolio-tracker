import { describe, expect, it } from "vitest";
import { integrity } from "../../src/projections/integrity.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

describe("integrity: dangling references", () => {
  it("reports a reference_etf_id that does not exist in the catalogue", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("ast_ok", { reference_etf_id: "ast_gold" });
    expect(integrity(projectLedger(b.build()))).toEqual([]);
    b.asset("ast_dangling", { reference_etf_id: "ast_missing" });
    const findings = integrity(projectLedger(b.build()));
    expect(findings).toEqual([
      {
        severity: "error",
        code: "dangling_reference",
        message: "asset ast_dangling references unknown reference_etf_id ast_missing",
        event_ids: [],
      },
    ]);
  });

  /**
   * The cheap half of the fingerprint of a filing (ADR-0020): whether it covers
   * as many lines as it has in front of it. Whether the **content** of those
   * lines still hashes the same is the deep check's, because it costs a
   * re-read of the whole file.
   */
  it("says when a filing claims to cover a different number of lines than it has before it", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const filing = b.filed({ tax_year: 2027 });
    expect(integrity(projectLedger(b.build(), { collectErrors: true }))).toEqual([]);
    filing.ledger_fingerprint = { ...filing.ledger_fingerprint, lines: 1 };
    const findings = integrity(projectLedger(b.build(), { collectErrors: true }));
    expect(findings.map((f) => [f.code, f.severity, f.event_ids])).toEqual([
      ["filing_fingerprint_lines", "error", [filing.id]],
    ]);
  });

  it("does not repeat a dangling corrects_id: the projection already rejects it", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const original = b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const correction = b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    correction.corrects_id = original.id;
    const findings = integrity(projectLedger(b.build(), { collectErrors: true }));
    expect(findings.map((f) => f.code)).toEqual(["dangling_correction"]);
    expect(findings[0]?.event_ids).toEqual([correction.id]);
  });
});

/**
 * **An explicit way out records the fact; it does not erase it** (ADR-0025).
 *
 * After `resealFilings` has written the fingerprints again over the rewritten
 * prefix, nothing in the file would say that one of them was never checked.
 * This line is the only trace left, so the verification says it **always** —
 * without expiring and without hiding— and with the words of the case: not
 * verifiable, and you gave it for good on such a day. If the warning went
 * away, the way out would have become a way of cleaning the record.
 */
describe("a fingerprint the user accepted as unverifiable", () => {
  it("is said by the verification for ever, with its reason and its date", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.recordedAt("2030-02-11");
    const waiver = b.raw({
      ...b.nextEnvelope("filing_fingerprint_waived"),
      type: "filing_fingerprint_waived",
      filing_id: "01ARYZ6S41TSV4RRFFQ69G5FAR",
      reason: "unreadable",
      declared_schema_version: 1,
      declared_lines: 7,
    } as never);
    const findings = integrity(projectLedger(b.build(), { collectErrors: true }));
    const waived = findings.find((finding) => finding.code === "filing_fingerprint_waived");
    expect(waived?.severity).toBe("warning");
    expect(waived?.message).toContain("unreadable");
    expect(waived?.message).toContain("2030-02-11");
    expect(waived?.event_ids).toEqual([waiver.id, "01ARYZ6S41TSV4RRFFQ69G5FAR"]);
  });

  it("says nothing when there is none, which is every ledger today", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const findings = integrity(projectLedger(b.build(), { collectErrors: true }));
    expect(findings.map((finding) => finding.code)).not.toContain("filing_fingerprint_waived");
  });
});
