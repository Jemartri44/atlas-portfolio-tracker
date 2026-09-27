// Feature 015, E3, block 4 (plan §7; §7 P16; §7.1 bis, B2 and N4): the four
// states of `sync/remote.json` and the marker, and which entry of
// `credentials.json` each order of the console may use in each — by the
// folder and the device, never by resemblance, and never deducing a remote.

import { describe, expect, it } from "vitest";
import {
  type CredentialEntry,
  EMPTY_CREDENTIALS,
  type RemoteJson,
  withEntry,
} from "../../src/access/credentials.js";
import { entryToStart, entryToSync, folderSyncState } from "../../src/access/folder-start.js";
import { initState } from "../../src/sync/join.js";
import { markerFor } from "../../src/sync/marker.js";

const ORIGIN = "https://atlas.example";
const OTHER = "https://other.example";
const A = "AAAAAAAAAAAAAAAAAAAAAA";
const B = "BBBBBBBBBBBBBBBBBBBBBB";
const FOLDER = "/libro";

const entry = (deviceId: string, folder = FOLDER, origin = ORIGIN): CredentialEntry => ({
  origin,
  device_id: deviceId,
  token: `atlasdt1.${"T".repeat(22)}.${"s".repeat(43)}`,
  token_id: "T".repeat(22),
  device_name: "casa",
  issued_at: "2026-10-01T10:00:00Z",
  expires_at: "2026-12-30T10:00:00Z",
  folder_hint: folder,
});
const remote = (deviceId = A, origin = ORIGIN): RemoteJson => ({
  format: 1,
  origin,
  device_id: deviceId,
});
const marker = markerFor([], 0);
const disabled = { ...marker, status: "disabled" as const, disabled_at: "2026-10-01T10:00:00Z" };
const file = withEntry(withEntry(EMPTY_CREDENTIALS, entry(A)), entry(B, "/otra"));

describe("folderSyncState: the four states of plan §7", () => {
  it("tells them apart by the marker and remote.json, and nothing else", () => {
    expect(folderSyncState({ present: false }, undefined)).toEqual({ state: "unsynced" });
    expect(folderSyncState({ present: true, marker: "missing" }, remote())).toEqual({
      state: "half",
      remote: remote(),
    });
    expect(folderSyncState({ present: true, marker }, remote())).toEqual({
      state: "synced",
      remote: remote(),
      enabled: true,
    });
    expect(folderSyncState({ present: true, marker: disabled }, remote())).toEqual({
      state: "synced",
      remote: remote(),
      enabled: false,
    });
    expect(folderSyncState({ present: true, marker: "unreadable" }, remote())).toEqual({
      state: "synced",
      remote: remote(),
      enabled: true,
    });
    for (const marked of [marker, "missing", "unreadable"] as const) {
      expect(folderSyncState({ present: true, marker: marked }, undefined)).toEqual({
        state: "unknown_remote",
      });
    }
  });
});

describe("entryToSync: sync, status and redownload", () => {
  it("uses only the entry remote.json names, and says why when there is none", () => {
    expect(entryToSync(folderSyncState({ present: false }, undefined), file)).toEqual({
      refused: "sync_not_configured",
    });
    expect(entryToSync(folderSyncState({ present: true, marker }, undefined), file)).toEqual({
      refused: "sync_remote_unknown",
    });
    for (const marked of [marker, "missing"] as const) {
      expect(
        entryToSync(folderSyncState({ present: true, marker: marked }, remote()), file),
      ).toEqual({
        entry: entry(A),
        remote: remote(),
      });
    }
    // The entry of that device but of another origin is not this folder's (B2).
    expect(entryToSync(folderSyncState({ present: true, marker }, remote(A, OTHER)), file)).toEqual(
      { refused: "sync_credential_missing" },
    );
  });
});

describe("entryToStart: init and join", () => {
  const unsynced = folderSyncState({ present: false }, undefined);

  it("in a folder never synced (S0), only an entry whose hint is exactly this folder", () => {
    expect(entryToStart("init", unsynced, file, FOLDER, { origin: ORIGIN })).toEqual({
      entry: entry(A),
      remote: remote(),
    });
    expect(entryToStart("join", unsynced, file, "/nueva", { origin: ORIGIN })).toEqual({
      refused: "credentials_no_entry_for_folder",
    });
    expect(entryToStart("init", unsynced, file, FOLDER, {})).toEqual({
      refused: "sync_origin_missing",
    });
    expect(entryToStart("init", unsynced, file, FOLDER, { origin: ORIGIN, device: B })).toEqual({
      refused: "credentials_no_entry_for_folder",
    });
  });

  it("in a half initialisation or join (S1), only the device and origin of remote.json", () => {
    const half = folderSyncState({ present: true, marker: "missing" }, remote());
    for (const how of ["init", "join"] as const) {
      expect(entryToStart(how, half, file, FOLDER, {})).toEqual({
        entry: entry(A),
        remote: remote(),
      });
      expect(entryToStart(how, half, file, FOLDER, { origin: OTHER })).toEqual({
        refused: "sync_remote_mismatch",
      });
      expect(entryToStart(how, half, file, FOLDER, { device: B })).toEqual({
        refused: "sync_remote_mismatch",
      });
    }
    const orphan = folderSyncState({ present: true, marker: "missing" }, remote(B, OTHER));
    expect(entryToStart("join", orphan, file, FOLDER, {})).toEqual({
      refused: "sync_credential_missing",
    });
  });

  it("in a synced folder, neither; after deactivating, joining again with its own entry", () => {
    const synced = folderSyncState({ present: true, marker }, remote());
    const off = folderSyncState({ present: true, marker: disabled }, remote());
    for (const how of ["init", "join"] as const) {
      expect(entryToStart(how, synced, file, FOLDER, {})).toEqual({
        refused: "sync_already_configured",
      });
    }
    expect(entryToStart("init", off, file, FOLDER, {})).toEqual({
      refused: "sync_already_configured",
    });
    expect(entryToStart("join", off, file, FOLDER, {})).toEqual({
      entry: entry(A),
      remote: remote(),
    });
    expect(entryToStart("join", off, file, FOLDER, { origin: OTHER })).toEqual({
      refused: "sync_remote_mismatch",
    });
  });

  it("in a folder synced without remote.json (S3), init refuses and join associates it by name", () => {
    const unknown = folderSyncState({ present: true, marker }, undefined);
    expect(entryToStart("init", unknown, file, FOLDER, { origin: ORIGIN })).toEqual({
      refused: "sync_remote_unknown",
    });
    expect(entryToStart("join", unknown, file, FOLDER, { origin: ORIGIN })).toEqual({
      entry: entry(A),
      remote: remote(),
    });
    expect(entryToStart("join", unknown, file, FOLDER, {})).toEqual({
      refused: "sync_origin_missing",
    });
  });

  it("passes on the refusal of several entries, with their devices", () => {
    const twice = withEntry(file, entry("CCCCCCCCCCCCCCCCCCCCCC"));
    expect(entryToStart("init", unsynced, twice, FOLDER, { origin: ORIGIN })).toEqual({
      refused: "credentials_several_for_folder",
      devices: [A, "CCCCCCCCCCCCCCCCCCCCCC"],
    });
  });
});

describe("initState: what an initialisation finds in the remote (S0 and S1)", () => {
  it("empty, the same bytes as the ledger, or another thing", () => {
    expect(initState([], "")).toBe("empty");
    expect(initState(["a"], "")).toBe("empty");
    expect(initState(["a", "b"], "a\nb\n")).toBe("same");
    expect(initState(["a"], "a\nb\n")).toBe("other");
    expect(initState(["a", "b"], "a\n")).toBe("other");
  });
});
