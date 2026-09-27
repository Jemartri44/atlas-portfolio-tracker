// Feature 015, E5: the pure rules of the administration of the remote.

import { describe, expect, it } from "vitest";
import {
  compareForRestore,
  forgetRefusal,
  forgottenDevice,
  parseAdminConfig,
  remoteRewritePermission,
} from "../../src/access/admin.js";
import { newDevice } from "../../src/access/device.js";
import { markerFor } from "../../src/sync/marker.js";
import { SAMPLES } from "../samples.js";

const device = (
  id: string,
  fields: { pending?: number; held?: number; forgotten?: boolean } = {},
) => ({
  ...newDevice({ deviceId: id, type: "console" as const, createdAt: "2026-10-01T10:00:00Z" }),
  pending: fields.pending ?? 0,
  held: fields.held ?? 0,
  ...(fields.forgotten === true
    ? { state: "forgotten" as const, forgotten_at: "2026-10-02T10:00:00Z" }
    : {}),
});
const A = "A".repeat(22);
const B = "B".repeat(22);
const synced = { present: true as const, marker: markerFor([], 0) };

describe("remoteRewritePermission", () => {
  it("refuses with an object that cannot be read, naming it", () => {
    expect(
      remoteRewritePermission({ present: false }, 0, [
        device(A),
        { device_id: B, unreadable: true },
      ]),
    ).toEqual({
      code: "rewrite_refused_device_unreadable",
      details: { devices: [B] },
    });
  });

  it("refuses with pending lines of a device alive, never of a forgotten one", () => {
    expect(
      remoteRewritePermission({ present: false }, 0, [device(A, { pending: 2 })]),
    ).toMatchObject({
      code: "rewrite_refused_pending_devices",
      details: { devices: [A] },
    });
    expect(
      remoteRewritePermission({ present: false }, 0, [device(A, { pending: 2, forgotten: true })]),
    ).toBeUndefined();
    // What a device only holds back does not block (§6.3 (V5)).
    expect(
      remoteRewritePermission({ present: false }, 0, [device(A, { held: 4 })]),
    ).toBeUndefined();
  });

  it("keeps the rules of the folder it runs from", () => {
    expect(remoteRewritePermission(synced, 3, [])).toMatchObject({
      code: "rewrite_refused_pending_here",
    });
    expect(remoteRewritePermission({ present: true, marker: "missing" }, 0, [])).toMatchObject({
      code: "rewrite_refused_marker_missing",
    });
    expect(remoteRewritePermission(synced, 0, [device(A)])).toBeUndefined();
  });
});

describe("forgetRefusal and forgottenDevice", () => {
  it("refuses a missing or unreadable object, and does nothing to a forgotten one", () => {
    expect(forgetRefusal(undefined, false)).toEqual({ code: "forget_device_missing", details: {} });
    expect(forgetRefusal("unreadable", true)).toEqual({
      code: "forget_device_unreadable",
      details: {},
    });
    expect(forgetRefusal(device(A, { forgotten: true }), false)).toBe("already_forgotten");
  });

  it("refuses with its queue published, unless forced", () => {
    expect(forgetRefusal(device(A, { pending: 1 }), false)).toEqual({
      code: "forget_refused_queue",
      details: { pending: 1, held: 0 },
    });
    expect(forgetRefusal(device(A, { held: 2 }), false)).toMatchObject({
      code: "forget_refused_queue",
    });
    expect(forgetRefusal(device(A, { pending: 1, held: 2 }), true)).toBeUndefined();
    expect(forgetRefusal(device(A), false)).toBeUndefined();
  });

  it("marks it forgotten with the instant, and changes nothing else", () => {
    const before = device(A, { pending: 1 });
    expect(forgottenDevice(before, "2026-10-03T10:00:00Z")).toEqual({
      ...before,
      state: "forgotten",
      forgotten_at: "2026-10-03T10:00:00Z",
    });
  });
});

describe("compareForRestore", () => {
  const [a, b, c] = [SAMPLES.account_created, SAMPLES.asset_created, SAMPLES.cash_deposit];

  it("says the same events, a prefix and its lost tail, or the difference both ways", () => {
    expect(compareForRestore([a, b], [a, b])).toEqual({ kind: "same" });
    expect(compareForRestore([a], [a, b, c])).toEqual({ kind: "prefix", lost: [b.id, c.id] });
    expect(compareForRestore([a, c], [a, b])).toEqual({
      kind: "differs",
      onlyCandidate: [c.id],
      onlyRemote: [b.id],
    });
    // Longer than the remote: never a prefix.
    expect(compareForRestore([a, b, c], [a, b])).toMatchObject({
      kind: "differs",
      onlyCandidate: [c.id],
    });
  });
});

describe("parseAdminConfig (data-model §9)", () => {
  const good = {
    admin_format: 1,
    environments: {
      prod: { region: "eu-west-1", data_bucket: "atlas-prod-data-x1", ssm_prefix: "/atlas/prod/" },
    },
  };

  it("reads the environments, strictly", () => {
    expect(parseAdminConfig(JSON.stringify(good))).toEqual({ environments: good.environments });
  });

  it.each([
    ["not JSON", "{"],
    ["not an object", "[]"],
    ["another format", JSON.stringify({ ...good, admin_format: 2 })],
    ["an unknown key", JSON.stringify({ ...good, credentials: {} })],
    ["environments that are not an object", JSON.stringify({ ...good, environments: [] })],
    ["a bad name", JSON.stringify({ ...good, environments: { Prod: good.environments.prod } })],
    [
      "an environment that is not an object",
      JSON.stringify({ ...good, environments: { prod: 1 } }),
    ],
    [
      "a key more in an environment",
      JSON.stringify({
        ...good,
        environments: { prod: { ...good.environments.prod, profile: "x" } },
      }),
    ],
    [
      "a bad region",
      JSON.stringify({
        ...good,
        environments: { prod: { ...good.environments.prod, region: "europe" } },
      }),
    ],
    [
      "a bad bucket",
      JSON.stringify({
        ...good,
        environments: { prod: { ...good.environments.prod, data_bucket: "A" } },
      }),
    ],
    [
      "a prefix of another environment",
      JSON.stringify({
        ...good,
        environments: { prod: { ...good.environments.prod, ssm_prefix: "/atlas/dev/" } },
      }),
    ],
    [
      "a region that is not text",
      JSON.stringify({ ...good, environments: { prod: { ...good.environments.prod, region: 1 } } }),
    ],
    [
      "a bucket that is not text",
      JSON.stringify({
        ...good,
        environments: { prod: { ...good.environments.prod, data_bucket: 1 } },
      }),
    ],
    [
      "a prefix that is not text",
      JSON.stringify({
        ...good,
        environments: { prod: { ...good.environments.prod, ssm_prefix: 1 } },
      }),
    ],
    ["null", "null"],
  ])("is unreadable with %s", (_what, text) => {
    expect(parseAdminConfig(text)).toBe("unreadable");
  });
});
