// Feature 016, E4 (plan §8; mutant 28): what the monthly dump does with each
// object, decided here and only here. A dump is **for ever**: an object is
// never overwritten, and a month left half done is finished by the retry
// without touching what an earlier attempt wrote.

import { describe, expect, it } from "vitest";
import {
  backupFindings,
  DUMP_LEDGER,
  DUMP_POSITIONS,
  dumpablePriceName,
  dumpManifestStep,
  dumpPrefix,
  dumpStep,
} from "../../src/jobs/backup.js";

const A = "a".repeat(64);
const B = "b".repeat(64);

describe("where a dump lives (E4)", () => {
  it("is the month of Madrid under backups/, with its ledger and its positions", () => {
    expect(dumpPrefix("2026-10")).toBe("backups/2026-10/");
    expect(DUMP_LEDGER).toBe("ledger.jsonl");
    expect(DUMP_POSITIONS).toBe("positions.json");
    for (const period of ["2026-13", "2026-1", "2026-10-01", "2026-Q4", "../x", ""]) {
      expect(() => dumpPrefix(period), period).toThrow(RangeError);
    }
  });

  it("copies from prices/ only plain names of the first level: never a way out", () => {
    for (const name of ["ast_a.jsonl", "%2Ex.jsonl", "_status.json", "symbols.json", "a-b.c"]) {
      expect(dumpablePriceName(name), name).toBe(true);
    }
    for (const name of ["", ".", "..", "a/b.jsonl", "a\\b", "a b", "ñ.jsonl", "x".repeat(256)]) {
      expect(dumpablePriceName(name), name).toBe(false);
    }
  });
});

describe("what the dump does with each object (mutant 28)", () => {
  it("writes what is not there, and leaves what is there with the same bytes", () => {
    expect(dumpStep({ existing: undefined, next: A, retrying: false })).toBe("write");
    expect(dumpStep({ existing: undefined, next: A, retrying: true })).toBe("write");
    expect(dumpStep({ existing: A, next: A, retrying: false })).toBe("same");
    expect(dumpStep({ existing: A, next: A, retrying: true })).toBe("same");
  });

  it("keeps other bytes an earlier attempt of the month left, and refuses them with none", () => {
    expect(dumpStep({ existing: B, next: A, retrying: true })).toBe("kept");
    expect(dumpStep({ existing: B, next: A, retrying: false })).toBe("differs");
  });

  it("writes the manifest of the ECB only over the very file it names", () => {
    expect(dumpManifestStep({ fileInDump: A, manifestSha256: A })).toBe("write");
    expect(dumpManifestStep({ fileInDump: B, manifestSha256: A })).toBe("inconsistent");
    expect(dumpManifestStep({ fileInDump: undefined, manifestSha256: A })).toBe("inconsistent");
  });
});

describe("what a dump leaves for the mail (only when it fails, §8.2 B2)", () => {
  it("says the objects it refused and the pair of the ECB it could not write, and nothing else", () => {
    expect(backupFindings({ differs: 0, ecbInconsistent: false, positionsMissing: false })).toEqual(
      [],
    );
    expect(backupFindings({ differs: 2, ecbInconsistent: false, positionsMissing: false })).toEqual(
      [{ code: "backup_object_differs", subject: "backup", counts: { objects: 2 } }],
    );
    expect(backupFindings({ differs: 0, ecbInconsistent: true, positionsMissing: false })).toEqual([
      { code: "backup_ecb_inconsistent", subject: "backup" },
    ]);
    expect(backupFindings({ differs: 1, ecbInconsistent: true, positionsMissing: true })).toEqual([
      { code: "backup_object_differs", subject: "backup", counts: { objects: 1 } },
      { code: "backup_ecb_inconsistent", subject: "backup" },
      { code: "backup_positions_missing", subject: "backup" },
    ]);
    // A ledger that does not project leaves the dump without its positions, and says so.
    expect(backupFindings({ differs: 0, ecbInconsistent: false, positionsMissing: true })).toEqual([
      { code: "backup_positions_missing", subject: "backup" },
    ]);
  });
});
