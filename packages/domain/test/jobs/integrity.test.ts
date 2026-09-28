// Feature 016, E4 (plan §9; Q7; mutants 29 and 30): what the quarterly
// integrity leaves for the mail. The errors of the check, the differences of
// the rehearsal and the size of the ledger above its threshold — each by code
// and by count, from closed lists, and nothing when there is nothing to do.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  INTEGRITY_ERROR_CODES,
  integrityFindings,
  REHEARSAL_CODES,
} from "../../src/jobs/integrity.js";

const clean = {
  errors: [],
  rehearsal: { ok: true, events: 12 } as const,
  size: { bytes: 1_048_576, threshold: 1_048_576 },
};

describe("what the integrity leaves for the mail (E4)", () => {
  it("leaves nothing when there is nothing to do: no error, no difference, not above the threshold", () => {
    expect(integrityFindings(clean)).toEqual([]);
  });

  it("warns of the size just above its threshold, never at it, saying both (mutant 30)", () => {
    expect(
      integrityFindings({ ...clean, size: { bytes: 1_048_577, threshold: 1_048_576 } }),
    ).toEqual([
      {
        code: "ledger_size_above_threshold",
        subject: "integrity",
        counts: { bytes: 1_048_577, threshold: 1_048_576 },
      },
    ]);
    // The threshold is the one the function is given, never one of the code.
    expect(integrityFindings({ ...clean, size: { bytes: 2048, threshold: 1024 } })).toEqual([
      {
        code: "ledger_size_above_threshold",
        subject: "integrity",
        counts: { bytes: 2048, threshold: 1024 },
      },
    ]);
  });

  it("counts the errors of the check by code, the codes of the projection apart", () => {
    expect(
      integrityFindings({
        ...clean,
        errors: [
          { code: "lots_mismatch" },
          { code: "negative_position" },
          { code: "lots_mismatch" },
          { code: "insufficient_position" },
        ],
      }),
    ).toEqual([
      {
        code: "integrity_errors",
        subject: "integrity",
        counts: { errors: 4, lots_mismatch: 2, negative_position: 1, other: 1 },
      },
    ]);
  });

  it("says every difference of the rehearsal by its code, and a dump that could not be rehearsed (mutant 29)", () => {
    expect(
      integrityFindings({
        ...clean,
        rehearsal: { ok: false, differs: { event_differs: 1, cash_differ: 1 } },
      }),
    ).toEqual([
      {
        code: "restore_rehearsal_differs",
        subject: "integrity",
        counts: { event_differs: 1, cash_differ: 1 },
      },
    ]);
    expect(
      integrityFindings({ ...clean, rehearsal: { ok: false, differs: { dump_missing: 1 } } }),
    ).toEqual([
      { code: "restore_rehearsal_differs", subject: "integrity", counts: { dump_missing: 1 } },
    ]);
    // A code the rehearsal does not know is never written as it came.
    expect(
      integrityFindings({ ...clean, rehearsal: { ok: false, differs: { "ES00 sentinel": 1 } } }),
    ).toEqual([{ code: "restore_rehearsal_differs", subject: "integrity", counts: { other: 1 } }]);
  });

  it("knows every error code the check can give: the closed list is the one of the sources", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const read = (file: string) => readFileSync(join(here, "../../src/projections", file), "utf8");
    const integrity = read("integrity.ts");
    const deep = read("deep-check.ts");
    const found = new Set([
      ...[...integrity.matchAll(/severity: "error",\s*code: "([a-z_]+)"/g)].map((m) => m[1]),
      ...[...deep.matchAll(/\berror\(\s*"([a-z_]+)"/g)].map((m) => m[1]),
    ]);
    expect([...found].sort()).toEqual([...INTEGRITY_ERROR_CODES].sort());
    expect(REHEARSAL_CODES).toEqual(
      expect.arrayContaining(["dump_missing", "dump_unreadable", "dump_invalid", "event_differs"]),
    );
  });
});
