// What a synced device refuses, each with its literal (bloque 6; V5; P2, P4).

import { describe, expect, it } from "vitest";
import { markerFor, type SyncPresence } from "../../src/sync/marker.js";
import {
  compactPermission,
  deactivatePermission,
  importPermission,
  rewritePermission,
} from "../../src/sync/permission.js";

const enabled: SyncPresence = { present: true, marker: markerFor([], 0) };
const disabled: SyncPresence = {
  present: true,
  marker: { ...markerFor([], 0), status: "disabled" },
};
const unreadable: SyncPresence = { present: true, marker: "unreadable" };
const missing: SyncPresence = { present: true, marker: "missing" };
const none: SyncPresence = { present: false };

const code = (refusal: { code: string } | undefined) => refusal?.code;

describe("the refusals of a synced device", () => {
  it("compact: a synced folder, an unreadable marker, sync/ without a marker (14)", () => {
    expect(code(compactPermission(enabled))).toBe("compact_refused_folder_synced");
    expect(code(compactPermission(unreadable))).toBe("compact_refused_marker_unreadable");
    expect(code(compactPermission(missing))).toBe("compact_refused_marker_missing");
    expect(compactPermission(disabled)).toBeUndefined();
    expect(compactPermission(none)).toBeUndefined();
  });

  it("rewriting the remote: pending here or published by another device block; held lines never do (V5)", () => {
    expect(rewritePermission(enabled, 0, [])).toBeUndefined();
    expect(rewritePermission(enabled, 2, [])).toEqual({
      code: "rewrite_refused_pending_here",
      details: { pending: 2 },
    });
    expect(
      rewritePermission(enabled, 0, [
        { device_id: "a", pending: 0, held: 5, last_sync_at: "t" },
        { device_id: "b", pending: 1, held: 0, last_sync_at: "t" },
      ]),
    ).toEqual({ code: "rewrite_refused_pending_devices", details: { devices: ["b"] } });
    expect(code(rewritePermission(unreadable, 0, []))).toBe("rewrite_refused_marker_unreadable");
    expect(code(rewritePermission(missing, 0, []))).toBe("rewrite_refused_marker_missing");
    expect(rewritePermission(none, 0, [])).toBeUndefined();
  });

  it("import: refused on a synced web, admitted once deactivated (P2)", () => {
    expect(code(importPermission(enabled))).toBe("import_refused_synced");
    expect(code(importPermission(unreadable))).toBe("import_refused_synced");
    expect(importPermission(disabled)).toBeUndefined();
    expect(importPermission(none)).toBeUndefined();
  });

  it("deactivate: refused with pending lines or an unreadable marker; held lines do not block (P4)", () => {
    expect(deactivatePermission(enabled, 1)).toEqual({
      code: "deactivate_refused_pending",
      details: { pending: 1 },
    });
    expect(code(deactivatePermission(unreadable, 0))).toBe("deactivate_refused_marker_unreadable");
    expect(deactivatePermission(enabled, 0)).toBeUndefined();
  });
});
