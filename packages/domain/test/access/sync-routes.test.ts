// Feature 015, E3: the rules of the routes of the sync and of the reference
// data (`docs/api.md` §5 and §6), pure: the etag a request asks for, the
// object of a device after it publishes, the names and types of the
// reference data, the index and the conditional read.

import { describe, expect, it } from "vitest";
import { API_ERRORS, refusal } from "../../src/access/codes.js";
import { newDevice } from "../../src/access/device.js";
import {
  DEVICE_BOUND_PATHS,
  expectedDeviceRefusal,
  ifNoneMatchHits,
  publishedDevice,
  referenceContentType,
  referenceIndex,
  referenceKey,
  refusalOfRemote,
  requestedEtag,
} from "../../src/access/sync-routes.js";
import { REMOTE_FAILURE_CODES, RemoteError } from "../../src/ports/remote-ledger.js";

const SHA = "a".repeat(64);

describe("requestedEtag: the If-Match of a write (§5.2 and §5.5)", () => {
  it("is absent without the header, and the quoted SHA-256 otherwise", () => {
    expect(requestedEtag(undefined)).toEqual({ absent: true });
    expect(requestedEtag(`"${SHA}"`)).toEqual({ etag: SHA });
  });

  it("never matches a weak, unquoted, listed or wildcard value: the write is 412", () => {
    for (const value of [
      `W/"${SHA}"`,
      SHA,
      `"${SHA}", "${SHA}"`,
      "*",
      '""',
      `"${SHA.toUpperCase()}"`,
    ]) {
      expect(requestedEtag(value), value).toEqual({ etag: "" });
    }
  });
});

describe("publishedDevice: what PUT /api/sync/devices/self writes (§5.3)", () => {
  const console = {
    ...newDevice({
      deviceId: "C".repeat(22),
      type: "console",
      createdAt: "2026-09-01T10:00:00Z",
      deviceName: "sobremesa",
    }),
    pending: 4,
  };

  it("keeps type, state, creation and name, and writes the queue and the hour", () => {
    expect(
      publishedDevice(
        console,
        { pending: 1, held: 2, last_sync_at: "2026-10-01T09:00:00Z" },
        "2026-10-01T10:00:00.000Z",
      ),
    ).toEqual({
      ...console,
      pending: 1,
      held: 2,
      last_sync_at: "2026-10-01T09:00:00Z",
      published_at: "2026-10-01T10:00:00.000Z",
    });
  });

  it("refuses a last_sync_at that is not an instant: the object would stop being readable", () => {
    expect(
      publishedDevice(
        console,
        { pending: 0, held: 0, last_sync_at: "ayer" },
        "2026-10-01T10:00:00Z",
      ),
    ).toEqual(refusal("body_invalid", { reason: "last_sync_at" }));
  });
});

describe("the reference data (§6)", () => {
  it("builds a key only from a name of the closed alphabet, inside its prefix", () => {
    expect(referenceKey("ecb", "eurofxref-hist.csv")).toEqual({
      key: "reference/ecb/eurofxref-hist.csv",
    });
    expect(referenceKey("prices", "IE00B4L5Y983.jsonl")).toEqual({
      key: "prices/IE00B4L5Y983.jsonl",
    });
    for (const name of [
      "..",
      "a..b.csv",
      ".hidden",
      "a/b.csv",
      "a\\\\b",
      "",
      "x".repeat(129),
      "é.csv",
      "a%2Fb",
    ]) {
      expect(referenceKey("ecb", name), name).toEqual(refusal("reference_name_invalid"));
    }
    expect(referenceKey("ecb", `a${"x".repeat(127)}`)).toEqual({
      key: `reference/ecb/a${"x".repeat(127)}`,
    });
  });

  /**
   * Feature 016, E2 (§8.2 M1, amending P6 bis; Q4): a name of `prices/` is
   * served when it is **exactly what `priceFileName` writes** for some asset
   * — decoding and encoding it again gives the same name — at most 255
   * characters, and `symbols.json`; never `_status.json` nor `config.json`.
   * The whole list of the reviewer of PR #99, with what each gives.
   */
  it("serves the price files by the round trip with priceFileName, at most 255 characters", () => {
    for (const name of [
      "IE00B4L5Y983.jsonl",
      "ast%25x.jsonl",
      "ast(b).jsonl",
      "ast!b.jsonl",
      "ast'b.jsonl",
      "ast*b.jsonl",
      "ast~b.jsonl",
      "_x.jsonl",
      "-x.jsonl",
      "%2Ex.jsonl",
      "%2E..jsonl",
      "a%20b.jsonl",
      "a%2Fb.jsonl",
      "%C3%B1and%C3%BA.jsonl",
      `${"a".repeat(249)}.jsonl`,
      "symbols.json",
    ]) {
      expect(referenceKey("prices", name), name).toEqual({ key: `prices/${name}` });
    }
    for (const name of [
      "_status.json",
      "config.json",
      `${"a".repeat(250)}.jsonl`,
      ".x.jsonl",
      "a b.jsonl",
      "a/b.jsonl",
      "a%2fb.jsonl",
      "%41.jsonl",
      "a%.jsonl",
      "a%E0%A4%A.jsonl",
      "ñ.jsonl",
      "x.csv",
      "x",
      ".jsonl",
      "",
      "..",
      "../ledger/ledger.jsonl",
      "..%2Fledger%2Fledger.jsonl",
    ]) {
      expect(referenceKey("prices", name), name).toEqual(refusal("reference_name_invalid"));
    }
  });

  it("serves only .csv, .jsonl and .json, each with its type", () => {
    expect(referenceContentType("a.csv")).toBe("text/csv; charset=utf-8");
    expect(referenceContentType("a.jsonl")).toBe("application/x-ndjson; charset=utf-8");
    expect(referenceContentType("a.json")).toBe("application/json");
    for (const name of ["a.txt", "a", "a.csv.bak", "a.JSON"]) {
      expect(referenceContentType(name), name).toBeUndefined();
    }
  });

  it("indexes the first level of each prefix, with the opaque version and the size", () => {
    expect(
      referenceIndex(
        [
          { key: "reference/ecb/manifest.json", etag: '"m1"', size: 120 },
          { key: "reference/ecb/eurofxref-hist.csv", etag: '"e1"', size: 900 },
          { key: "reference/ecb/api-exr.csv", etag: '"a1"', size: 800 },
        ],
        [
          { key: "prices/X.jsonl", etag: 'W/"p1"', size: 30 },
          { key: "prices/_status.json", etag: '"s1"', size: 40 },
          { key: "prices/config.json", etag: '"c1"', size: 10 },
          { key: "prices/ .jsonl", etag: '"b1"', size: 10 },
        ],
      ),
    ).toEqual({
      ecb: [
        { name: "api-exr.csv", version: "a1", size: 800 },
        { name: "eurofxref-hist.csv", version: "e1", size: 900 },
        { name: "manifest.json", version: "m1", size: 120 },
      ],
      prices: [{ name: "X.jsonl", version: "p1", size: 30 }],
    });
  });

  it("answers 304 to the same version, strong or weak, and to *", () => {
    expect(ifNoneMatchHits('"v1"', "v1")).toBe(true);
    expect(ifNoneMatchHits('W/"v1"', "v1")).toBe(true);
    expect(ifNoneMatchHits('"v0", "v1"', "v1")).toBe(true);
    expect(ifNoneMatchHits("*", "v1")).toBe(true);
    expect(ifNoneMatchHits('"v0"', "v1")).toBe(false);
    expect(ifNoneMatchHits("v1", "v1")).toBe(false);
    expect(ifNoneMatchHits(undefined, "v1")).toBe(false);
  });
});

describe("refusalOfRemote: a rule of the sync said no (§5 and §7)", () => {
  it("answers with the code, the status and the details of the rule, never folded", () => {
    expect(refusalOfRemote(new RemoteError("body_invalid", 400, { reason: "line" }))).toEqual(
      refusal("body_invalid", { reason: "line" }),
    );
    expect(
      refusalOfRemote(new RemoteError("init_rejected", 422, { code: "raw_line_break", line: 2 })),
    ).toEqual(refusal("init_rejected", { code: "raw_line_break", line: 2 }));
  });

  it("refuses to translate a code the API does not answer", () => {
    expect(() => refusalOfRemote(new RemoteError("network_failed", undefined))).toThrow(
      /network_failed/,
    );
  });

  it("keeps every code the routes of §5 can answer inside REMOTE_FAILURE_CODES", () => {
    const answerable = Object.keys(API_ERRORS).filter(
      (code) =>
        !code.startsWith("console_") &&
        !code.startsWith("reissue_") &&
        !["pkce_mismatch", "reference_name_invalid"].includes(code),
    );
    for (const code of answerable) {
      expect(REMOTE_FAILURE_CODES as readonly string[], code).toContain(code);
    }
  });
});

describe("expectedDeviceRefusal: the device the client expects (review of PR #97, security B1)", () => {
  const web = { type: "web", deviceId: "D".repeat(22) } as const;
  const console = { type: "console", deviceId: "C".repeat(22) } as const;

  it("asks the cookie for the header, and lets the token go without it", () => {
    expect(expectedDeviceRefusal(web, undefined)).toEqual(refusal("expected_device_required"));
    expect(expectedDeviceRefusal(console, undefined)).toBeUndefined();
  });

  it("admits the credential's own device and refuses any other, whichever the credential", () => {
    expect(expectedDeviceRefusal(web, web.deviceId)).toBeUndefined();
    expect(expectedDeviceRefusal(console, console.deviceId)).toBeUndefined();
    expect(expectedDeviceRefusal(web, console.deviceId)).toEqual(refusal("sync_device_changed"));
    expect(expectedDeviceRefusal(console, "")).toEqual(refusal("sync_device_changed"));
    expect(API_ERRORS.expected_device_required).toBe(400);
    expect(API_ERRORS.sync_device_changed).toBe(409);
  });

  it("binds the routes that act as a device, and not the reference data", () => {
    expect([...DEVICE_BOUND_PATHS].sort()).toEqual([
      "/api/ledger",
      "/api/ledger/lines",
      "/api/sync/devices/self",
    ]);
  });
});
