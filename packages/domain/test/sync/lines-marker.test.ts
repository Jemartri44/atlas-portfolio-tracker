import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { sha256Hex, utf8Encode } from "../../src/ids/sha256.js";
import {
  EMPTY_ETAG,
  lineSha256,
  linesOfText,
  prefixSha256,
  textOfLines,
} from "../../src/sync/lines.js";
import {
  commonPrefix,
  markerFor,
  parseMarker,
  serializeMarker,
  syncConfigured,
} from "../../src/sync/marker.js";

const unreadable = (text: string): string => {
  try {
    parseMarker(text);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe("sync_marker_unreadable");
    return (error as ValidationError).details.reason as string;
  }
  throw new Error("parsed");
};

describe("the lines of the sync", () => {
  it("splits a file into its lines and back, byte for byte", () => {
    expect(linesOfText("a\nb\n")).toEqual(["a", "b"]);
    expect(linesOfText("a\nb")).toEqual(["a", "b"]);
    expect(linesOfText("")).toEqual([]);
    expect(textOfLines(["a", "ñ"])).toBe("a\nñ\n");
  });

  it("hashes the bytes of a prefix and of a line, and knows the etag of nothing", () => {
    expect(prefixSha256(["a", "b", "c"], 2)).toBe(sha256Hex(utf8Encode("a\nb\n")));
    expect(prefixSha256(["a"], 0)).toBe(EMPTY_ETAG);
    expect(lineSha256("ñ")).toBe(sha256Hex(utf8Encode("ñ")));
  });
});

describe("the marker", () => {
  const marker = markerFor(["a", "b"], 1, { remote_etag: "e" });

  it("round-trips, and records the synced prefix by the hash of its bytes", () => {
    expect(parseMarker(serializeMarker(marker))).toEqual(marker);
    expect(marker.synced_sha256).toBe(prefixSha256(["a"], 1));
    expect(marker.status).toBe("enabled");
    expect(marker.confirmations).toEqual([]);
  });

  it("is unreadable when it is not exactly a marker, and says why", () => {
    expect(unreadable("{")).toBe("json");
    expect(unreadable("[]")).toBe("format");
    expect(unreadable(JSON.stringify({ ...marker, sync_format: 2 }))).toBe("format");
    for (const broken of [
      { ...marker, status: "off" },
      { ...marker, synced_lines: -1 },
      { ...marker, synced_lines: 1.5 },
      { ...marker, synced_lines: "1" },
      { ...marker, synced_sha256: "x" },
      { ...marker, synced_sha256: 1 },
      { ...marker, confirmations: {} },
      { ...marker, remote_etag: 1 },
      { ...marker, disabled_at: 1 },
      { ...marker, last_sync_at: 1 },
    ]) {
      expect(unreadable(JSON.stringify(broken))).toBe("fields");
    }
    const confirmation = { line_sha256: "x", duplicates: [], closed: [], confirmed_at: "t" };
    for (const broken of [
      "x",
      { ...confirmation, line_sha256: 1 },
      { ...confirmation, duplicates: [1] },
      { ...confirmation, duplicates: "x" },
      { ...confirmation, closed: [1] },
      { ...confirmation, confirmed_at: 1 },
    ]) {
      expect(unreadable(JSON.stringify({ ...marker, confirmations: [broken] }))).toBe(
        "confirmations",
      );
    }
    expect(
      parseMarker(JSON.stringify({ ...marker, confirmations: [confirmation] })).confirmations,
    ).toEqual([confirmation]);
  });

  it("rebuilds the synced prefix as the part in common, byte for byte", () => {
    expect(commonPrefix(["a", "b", "c"], ["a", "b", "x", "y"])).toBe(2);
    expect(commonPrefix(["a"], ["a", "b"])).toBe(1);
    expect(commonPrefix(["a", "b"], ["a"])).toBe(1);
    expect(commonPrefix([], ["a"])).toBe(0);
  });

  it("says a sync is configured with sync/ present and the marker not disabled (D-Q6)", () => {
    expect(syncConfigured({ present: false })).toBe(false);
    expect(syncConfigured({ present: true, marker: "missing" })).toBe(true);
    expect(syncConfigured({ present: true, marker: "unreadable" })).toBe(true);
    expect(syncConfigured({ present: true, marker })).toBe(true);
    expect(syncConfigured({ present: true, marker: { ...marker, status: "disabled" } })).toBe(
      false,
    );
  });
});
