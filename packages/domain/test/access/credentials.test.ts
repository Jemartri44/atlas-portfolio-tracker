// Feature 015, E2: what the console keeps (data-model §7 and §8; plan §4.2,
// T30 to T36): `credentials.json` as a map by device, `sync/remote.json`,
// which entry each order may use (B2), the folders that never nest and the
// warning of an expiry close by.

import { describe, expect, it } from "vitest";
import {
  type CredentialEntry,
  EMPTY_CREDENTIALS,
  entryForRemote,
  entryForStart,
  expiryWarning,
  foldersNested,
  isCredentialEntry,
  isHttpsOrigin,
  parseCredentials,
  parseRemoteJson,
  serializeCredentials,
  serializeRemoteJson,
  withEntry,
  withoutEntry,
} from "../../src/access/credentials.js";

const ORIGIN = "https://atlas.example";
const A = "AAAAAAAAAAAAAAAAAAAAAA";
const B = "BBBBBBBBBBBBBBBBBBBBBB";
const TID = "TTTTTTTTTTTTTTTTTTTTTT";

const entry = (deviceId: string, folder: string, origin = ORIGIN): CredentialEntry => ({
  origin,
  device_id: deviceId,
  token: `atlasdt1.${TID}.${"s".repeat(43)}`,
  token_id: TID,
  device_name: "casa",
  issued_at: "2026-10-01T10:00:00Z",
  expires_at: "2026-12-30T10:00:00Z",
  folder_hint: folder,
});

describe("credentials.json (data-model §7)", () => {
  it("round-trips a map by device id, and each entry of its own (mutant 29 bis)", () => {
    const file = withEntry(withEntry(EMPTY_CREDENTIALS, entry(A, "/a")), entry(B, "/b"));
    expect(Object.keys(file.entries).sort()).toEqual([A, B]);
    expect(parseCredentials(serializeCredentials(file))).toEqual(file);
    // Signing in again from B replaces B's entry and only B's.
    const again = withEntry(file, { ...entry(B, "/b"), device_name: "otra" });
    expect(again.entries[A]).toEqual(entry(A, "/a"));
    expect(again.entries[B]?.device_name).toBe("otra");
    expect(Object.keys(withoutEntry(again, A).entries)).toEqual([B]);
  });

  it("is unreadable with anything out of its shape", () => {
    const good = JSON.parse(serializeCredentials(withEntry(EMPTY_CREDENTIALS, entry(A, "/a"))));
    const bad: unknown[] = [
      { ...good, credentials_format: 2 },
      { ...good, extra: true },
      { credentials_format: 1 },
      { credentials_format: 1, entries: [] },
      { credentials_format: 1, entries: { [B]: entry(A, "/a") } },
      { credentials_format: 1, entries: { [A]: { ...entry(A, "/a"), extra: 1 } } },
      { credentials_format: 1, entries: { [A]: { ...entry(A, "/a"), origin: "http://x" } } },
      { credentials_format: 1, entries: { [A]: { ...entry(A, "/a"), token: "x" } } },
      { credentials_format: 1, entries: { [A]: { ...entry(A, "/a"), token: 5 } } },
      { credentials_format: 1, entries: { [A]: { ...entry(A, "/a"), token_id: B } } },
      { credentials_format: 1, entries: { [A]: { ...entry(A, "/a"), device_name: 1 } } },
      { credentials_format: 1, entries: { [A]: { ...entry(A, "/a"), issued_at: "x" } } },
      { credentials_format: 1, entries: { [A]: { ...entry(A, "/a"), expires_at: "x" } } },
      { credentials_format: 1, entries: { [A]: { ...entry(A, "/a"), folder_hint: "rel" } } },
      { credentials_format: 1, entries: { [A]: { ...entry(A, "/a"), folder_hint: 1 } } },
      { credentials_format: 1, entries: { x: { ...entry("x", "/a") } } },
      { credentials_format: 1, entries: { [A]: "x" } },
    ];
    for (const value of bad) {
      expect(parseCredentials(JSON.stringify(value))).toBe("unreadable");
    }
    expect(parseCredentials("{")).toBe("unreadable");
    expect(parseCredentials("null")).toBe("unreadable");
  });
});

describe("an entry as the console receives it (review of PR #95, N5)", () => {
  it("is valid only with the rules of the file", () => {
    expect(isCredentialEntry(entry(A, "/a"))).toBe(true);
    for (const bad of [
      { ...entry(A, "/a"), token: "not-a-token" },
      { ...entry(A, "/a"), token_id: B },
      { ...entry(A, "/a"), origin: "http://x" },
      { ...entry(A, "/a"), device_id: "x" },
      { ...entry(A, "/a"), extra: 1 },
      "x",
      null,
    ]) {
      expect(isCredentialEntry(bad)).toBe(false);
    }
  });
});

describe("sync/remote.json (data-model §8)", () => {
  it("is one line with exactly its three keys", () => {
    const text = serializeRemoteJson({ format: 1, origin: ORIGIN, device_id: A });
    expect(text).toBe(`{"format":1,"origin":"${ORIGIN}","device_id":"${A}"}\n`);
    expect(parseRemoteJson(text)).toEqual({ format: 1, origin: ORIGIN, device_id: A });
    for (const bad of [
      text.slice(0, -1),
      `${text}\n`,
      `{"format":2,"origin":"${ORIGIN}","device_id":"${A}"}\n`,
      `{"format":1,"origin":"${ORIGIN}/api","device_id":"${A}"}\n`,
      `{"format":1,"origin":"${ORIGIN}","device_id":"x"}\n`,
      `{"format":1,"origin":"${ORIGIN}","device_id":"${A}","x":1}\n`,
      "{\n",
      "[]\n",
    ]) {
      expect(parseRemoteJson(bad)).toBe("unreadable");
    }
  });

  it("knows an origin of https with a host and maybe a port, and no path", () => {
    expect(isHttpsOrigin("https://atlas.example:8443")).toBe(true);
    for (const bad of ["http://atlas.example", "https://atlas.example/", "https://", 1]) {
      expect(isHttpsOrigin(bad)).toBe(false);
    }
  });
});

describe("which entry an order uses (B2; T34)", () => {
  const file = withEntry(
    withEntry(withEntry(EMPTY_CREDENTIALS, entry(A, "/folder-a")), entry(B, "/folder-b")),
    entry("CCCCCCCCCCCCCCCCCCCCCC", "/folder-a", "https://other.example"),
  );

  it("renews and syncs only with the entry sync/remote.json names, for its origin", () => {
    expect(entryForRemote(file, { format: 1, origin: ORIGIN, device_id: B })).toEqual(
      entry(B, "/folder-b"),
    );
    // No entry of that device: none, never "the one of the same origin".
    expect(
      entryForRemote(file, { format: 1, origin: ORIGIN, device_id: "ZZZZZZZZZZZZZZZZZZZZZZ" }),
    ).toBeUndefined();
    expect(
      entryForRemote(file, { format: 1, origin: "https://other.example", device_id: A }),
    ).toBeUndefined();
  });

  it("starts only with an entry whose hint is exactly this folder, even the only one", () => {
    expect(entryForStart(file, ORIGIN, "/folder-a", undefined)).toEqual({
      entry: entry(A, "/folder-a"),
    });
    expect(entryForStart(file, ORIGIN, "/folder-c", undefined)).toEqual({
      refused: "credentials_no_entry_for_folder",
    });
    expect(entryForStart(file, ORIGIN, "/folder-a/", undefined)).toEqual({
      refused: "credentials_no_entry_for_folder",
    });
    const twice = withEntry(file, { ...entry("DDDDDDDDDDDDDDDDDDDDDD", "/folder-a") });
    expect(entryForStart(twice, ORIGIN, "/folder-a", undefined)).toEqual({
      refused: "credentials_several_for_folder",
      devices: [A, "DDDDDDDDDDDDDDDDDDDDDD"],
    });
    expect(entryForStart(twice, ORIGIN, "/folder-a", A)).toEqual({ entry: entry(A, "/folder-a") });
    expect(entryForStart(twice, ORIGIN, "/folder-a", B)).toEqual({
      refused: "credentials_no_entry_for_folder",
    });
  });
});

describe("the folders never nest (ADR-0033, point 3; T30)", () => {
  it("refuses one inside the other, either way, and the same folder", () => {
    expect(foldersNested("/home/u/.config/atlas", "/home/u/libro")).toBe(false);
    expect(foldersNested("/home/u/.config/atlas", "/home/u/.config/atlas-libro")).toBe(false);
    expect(foldersNested("/home/u/libro", "/home/u/libro/.config/atlas")).toBe(true);
    expect(foldersNested("/home/u/libro/.config/atlas/", "/home/u/libro")).toBe(true);
    expect(foldersNested("/home/u/libro", "/home/u/libro")).toBe(true);
    expect(foldersNested("/", "/home/u")).toBe(true);
    expect(foldersNested("/home/u", "/")).toBe(true);
  });
});

describe("the warning of an expiry close by (ADR-0033, point 7; T36)", () => {
  const e = entry(A, "/a");
  const at = (days: number) => Date.parse(e.expires_at) - days * 86_400_000;

  it("warns at the threshold and below, never above it", () => {
    expect(expiryWarning(e, at(15), 14)).toBeUndefined();
    expect(expiryWarning(e, at(14), 14)).toBe(14);
    expect(expiryWarning(e, at(13), 14)).toBe(13);
    expect(expiryWarning(e, at(-3), 14)).toBe("expired");
  });

  it("counts whole days left, and says expired only once it is (review of PR #95, N1)", () => {
    const hours = (count: number) => Date.parse(e.expires_at) - count * 3_600_000;
    expect(expiryWarning(e, hours(23), 14)).toBe(0);
    expect(expiryWarning(e, hours(1), 14)).toBe(0);
    expect(expiryWarning(e, hours(25), 14)).toBe(1);
    expect(expiryWarning(e, Date.parse(e.expires_at) - 1, 14)).toBe(0);
    expect(expiryWarning(e, Date.parse(e.expires_at), 14)).toBe("expired");
  });
});
