import { describe, expect, it } from "vitest";
import { EMPTY_ETAG, linesOfText, textOfLines } from "../../src/sync/lines.js";

describe("the lines of the ledger", () => {
  it("splits a file into its lines and back, byte for byte", () => {
    expect(linesOfText("a\nb\n")).toEqual(["a", "b"]);
    expect(linesOfText("a\nb")).toEqual(["a", "b"]);
    expect(linesOfText("")).toEqual([]);
    expect(textOfLines(["a", "ñ"])).toBe("a\nñ\n");
  });

  it("knows the etag of nothing", () => {
    expect(EMPTY_ETAG).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("the archives of the sync", () => {
  it("is named by Madrid date and time, and the start of the etag", async () => {
    const { syncArchiveName } = await import("../../src/sync/archive.js");
    const etag = "0123456789abcdef".repeat(4);
    expect(syncArchiveName("restore", new Date("2026-09-25T04:12:05Z"), etag)).toBe(
      "pre-restore-2026-09-25T061205-0123456789ab.jsonl",
    );
    // Winter and summer time of Madrid, and the turn of the year.
    expect(syncArchiveName("restore", new Date("2026-12-31T23:30:00Z"), etag)).toBe(
      "pre-restore-2027-01-01T003000-0123456789ab.jsonl",
    );
  });
});
