// The read-only port of the reference data (review of PR #96, security N1).

import { describe, expect, it } from "vitest";
import { referenceReader } from "../../src/aws/reference-reader.js";
import { TestOnlyFakeS3 } from "./test-only-fake-s3.js";

describe("referenceReader", () => {
  it("reads and lists the first level of its two prefixes, and has no write", async () => {
    const s3 = new TestOnlyFakeS3();
    s3.seed("reference/ecb/a.csv", "a");
    s3.seed("prices/X.jsonl", "x");
    const reader = referenceReader(s3);
    expect(new TextDecoder().decode((await reader.get("reference/ecb/a.csv"))?.body)).toBe("a");
    expect((await reader.list("prices/")).map((object) => object.key)).toEqual(["prices/X.jsonl"]);
    expect(Object.keys(reader).sort()).toEqual(["get", "list"]);
  });

  it("refuses any other key or prefix before S3 is asked", async () => {
    const s3 = new TestOnlyFakeS3();
    s3.seed("ledger/ledger.jsonl", "libro");
    const reader = referenceReader(s3);
    for (const key of [
      "ledger/ledger.jsonl",
      "documents/x.pdf",
      "reference/ecb/previous/a.csv",
      "reference/other/a.csv",
      "prices",
    ]) {
      await expect(reader.get(key), key).rejects.toBeInstanceOf(RangeError);
    }
    await expect(reader.list("ledger/" as never)).rejects.toBeInstanceOf(RangeError);
    expect(s3.calls).toEqual([]);
  });
});
