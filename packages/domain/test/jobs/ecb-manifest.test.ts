// Feature 016, E1: the file in force of the ECB history, from its manifest.

import { describe, expect, it } from "vitest";
import { activeHistoryOf } from "../../src/jobs/ecb-manifest.js";

const SHA = "a".repeat(64);
const manifest = (active: unknown) => JSON.stringify({ active, rejected: [] });

describe("the manifest of the ECB history", () => {
  it("says the file in force, its source and its SHA-256", () => {
    expect(
      activeHistoryOf(
        manifest({
          file: "eurofxref-hist.csv",
          source: "zip",
          sha256: SHA,
          url: "u",
          fetched_at: "t",
        }),
      ),
    ).toEqual({
      file: "eurofxref-hist.csv",
      source: "zip",
      sha256: SHA,
    });
    expect(
      activeHistoryOf(manifest({ file: "api-exr.csv", source: "api", sha256: SHA }))?.file,
    ).toBe("api-exr.csv");
  });

  it("gives nothing for a manifest that does not say it, or names another file", () => {
    for (const text of [
      "not json",
      "{}",
      manifest("x"),
      manifest({ file: "api-exr.csv", source: "zip", sha256: SHA }),
      manifest({ file: "../ledger/ledger.jsonl", source: "zip", sha256: SHA }),
      manifest({ file: "eurofxref-hist.csv", source: "ftp", sha256: SHA }),
      manifest({ file: "eurofxref-hist.csv", source: "zip", sha256: "A".repeat(64) }),
      manifest({ file: "eurofxref-hist.csv", source: "zip", sha256: 7 }),
      // Read strictly, as the web reads it too (feature 016, E3).
      "[]",
      `{"active":${JSON.stringify({ file: "eurofxref-hist.csv", source: "zip", sha256: SHA })},"active":{}}`,
      `{"active":{"file":"eurofxref-hist.csv","source":"zip","sha256":"${SHA}"},"x":"\ud800"}`,
    ]) {
      expect(activeHistoryOf(text), text).toBeUndefined();
    }
  });
});
