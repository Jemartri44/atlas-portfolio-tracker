// Feature 016, E2 (R31, mutant 19): an activation of the ECB history cut
// between the file and the manifest is undone, never used as if it matched.

import { describe, expect, it } from "vitest";
import { ecbRecovery } from "../../src/jobs/ecb-recovery.js";

const ACTIVE = {
  file: "eurofxref-hist.csv" as const,
  source: "zip" as const,
  sha256: "a".repeat(64),
};

describe("the recovery of the ECB history", () => {
  it("does nothing without a manifest, or when the file matches it", () => {
    expect(
      ecbRecovery({ active: undefined, fileSha256: undefined, previousSha256: undefined }),
    ).toEqual({ kind: "none" });
    expect(
      ecbRecovery({ active: ACTIVE, fileSha256: ACTIVE.sha256, previousSha256: "b".repeat(64) }),
    ).toEqual({
      kind: "none",
    });
  });

  it("undoes a file replaced under the old manifest when previous/ holds what the manifest records", () => {
    expect(
      ecbRecovery({ active: ACTIVE, fileSha256: "c".repeat(64), previousSha256: ACTIVE.sha256 }),
    ).toEqual({
      kind: "undo",
      file: "eurofxref-hist.csv",
    });
    expect(
      ecbRecovery({ active: ACTIVE, fileSha256: undefined, previousSha256: ACTIVE.sha256 }),
    ).toEqual({
      kind: "undo",
      file: "eurofxref-hist.csv",
    });
  });

  it("says damaged, and undoes nothing, when nothing holds what the manifest records", () => {
    for (const previousSha256 of [undefined, "d".repeat(64)]) {
      expect(ecbRecovery({ active: ACTIVE, fileSha256: "c".repeat(64), previousSha256 })).toEqual({
        kind: "damaged",
      });
    }
  });
});
