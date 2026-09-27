// Feature 015, E4, block 2 (§7 P1, option (a); `docs/api.md` §5.4): the web
// syncs as the device it joined with. A session that brings another id —
// the one it had was forgotten, or never accepted — never publishes the old
// queue as the new device: the sync refuses, and joining again is the way out.

import { describe, expect, it } from "vitest";
import { markerFor } from "../../src/sync/marker.js";
import { webJoinRefusal, webSyncRefusal } from "../../src/sync/web-device.js";

const A = "AAAAAAAAAAAAAAAAAAAAAA";
const B = "BBBBBBBBBBBBBBBBBBBBBB";
const marker = markerFor([], 0);

describe("webSyncRefusal", () => {
  it("lets the device it joined with sync", () => {
    expect(webSyncRefusal({ present: true, marker }, A, A)).toBeUndefined();
  });

  it("refuses another device, saying both, and a missing one", () => {
    expect(webSyncRefusal({ present: true, marker }, A, B)).toEqual({
      code: "sync_device_changed",
      details: { joined: A, session: B },
    });
    expect(webSyncRefusal({ present: true, marker }, undefined, B)).toEqual({
      code: "sync_device_unknown",
      details: {},
    });
  });

  it("says first what the presence says: not configured, or deactivated", () => {
    expect(webSyncRefusal({ present: false }, undefined, A)).toEqual({
      code: "sync_not_configured",
      details: {},
    });
    expect(
      webSyncRefusal(
        { present: true, marker: { ...marker, status: "disabled", disabled_at: "t" } },
        A,
        A,
      ),
    ).toEqual({ code: "sync_deactivated", details: {} });
  });
});

describe("webJoinRefusal", () => {
  it("lets a browser that never synced, or one whose sync is off, start", () => {
    expect(webJoinRefusal({ present: false }, undefined, A, "init")).toBeUndefined();
    expect(
      webJoinRefusal(
        { present: true, marker: { ...marker, status: "disabled", disabled_at: "t" } },
        A,
        B,
        "join",
      ),
    ).toBeUndefined();
  });

  it("finishes a half start only as the same device", () => {
    expect(webJoinRefusal({ present: true, marker: "missing" }, A, A, "init")).toBeUndefined();
    expect(webJoinRefusal({ present: true, marker: "missing" }, A, B, "join")).toEqual({
      code: "sync_device_changed",
      details: { joined: A, session: B },
    });
  });

  it("lets a synced browser join again when its device changed, and never initialise", () => {
    expect(webJoinRefusal({ present: true, marker }, A, B, "join")).toBeUndefined();
    expect(webJoinRefusal({ present: true, marker }, undefined, B, "join")).toBeUndefined();
    expect(webJoinRefusal({ present: true, marker }, A, A, "join")).toEqual({
      code: "sync_already_configured",
      details: {},
    });
    expect(webJoinRefusal({ present: true, marker }, A, B, "init")).toEqual({
      code: "sync_already_configured",
      details: {},
    });
    // An unreadable marker counts as configured, the safe side (D-Q6).
    expect(webJoinRefusal({ present: true, marker: "unreadable" }, A, B, "join")).toBeUndefined();
    expect(webJoinRefusal({ present: true, marker: "unreadable" }, A, A, "init")).toEqual({
      code: "sync_already_configured",
      details: {},
    });
  });
});
