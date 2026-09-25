// Feature 015, E1: the signed payloads and what the SPA learns of its session
// (plan §4.1, R08, R19, R23; data-model §1).

import { describe, expect, it } from "vitest";
import { instantOf, isId22, isId43, isInstant } from "../../src/access/ids.js";
import { presentedDeviceId, sessionView } from "../../src/access/session.js";
import {
  isSubject,
  loginPayload,
  readLoginPayload,
  readSessionPayload,
  SIGNING,
  sessionPayload,
  splitSigned,
} from "../../src/access/signed.js";

const ID22 = "AAAAAAAAAAAAAAAAAAAAAA";
const ID22B = "BBBBBBBBBBBBBBBBBBBBBB";
const ID43 = "C".repeat(43);
const NOW = 1_790_000_000;

const session = sessionPayload({
  sub: "1234567890",
  sid: ID22,
  did: ID22B,
  now: NOW,
  ttlSeconds: 28_800,
});
const login = loginPayload({
  state: ID43,
  nonce: ID43,
  verifier: ID43,
  did: undefined,
  now: NOW,
  ttlSeconds: 600,
});

describe("the purposes of a signature (B3)", () => {
  it("gives each purpose its own HKDF info and its own typ", () => {
    const infos = Object.values(SIGNING).map((purpose) => purpose.info);
    const typs = Object.values(SIGNING).map((purpose) => purpose.typ);
    expect(new Set(infos).size).toBe(3);
    expect(new Set(typs).size).toBe(3);
    expect(SIGNING.session).toEqual({ info: "atlas session v1", typ: "atlas.session" });
    expect(SIGNING.login).toEqual({ info: "atlas login v1", typ: "atlas.login" });
    expect(SIGNING.console_code).toEqual({
      info: "atlas console_code v1",
      typ: "atlas.console_code",
    });
  });

  it("splits payload and MAC, and nothing else", () => {
    expect(splitSigned(`abc.${"m".repeat(43)}`)).toEqual({ payload: "abc", mac: "m".repeat(43) });
    for (const text of [
      `abc.${"m".repeat(42)}`,
      `a.b.${"m".repeat(43)}`,
      `.${"m".repeat(43)}`,
      `a+b.${"m".repeat(43)}`,
      "",
    ]) {
      expect(splitSigned(text)).toBeUndefined();
    }
  });
});

describe("reading a session payload (R08, R19)", () => {
  const read = (value: unknown, now = NOW) => readSessionPayload(JSON.stringify(value), now);

  it("reads a good one, with the device id it carries", () => {
    expect(read(session)).toEqual({ ok: session });
    expect(session).toEqual({
      typ: "atlas.session",
      v: 1,
      sub: "1234567890",
      sid: ID22,
      did: ID22B,
      iat: NOW,
      exp: NOW + 28_800,
    });
  });

  it("refuses another typ, another version, an unknown key, a missing field or a bad value", () => {
    expect(read({ ...session, typ: "atlas.login" })).toEqual({ failure: "invalid" });
    expect(read({ ...session, v: 2 })).toEqual({ failure: "invalid" });
    expect(read({ ...session, email: "a@b.c" })).toEqual({ failure: "invalid" });
    expect(read({ ...session, did: undefined })).toEqual({ failure: "invalid" });
    expect(read({ ...session, did: "short" })).toEqual({ failure: "invalid" });
    expect(read({ ...session, sid: "x".repeat(23) })).toEqual({ failure: "invalid" });
    expect(read({ ...session, sub: "x y" })).toEqual({ failure: "invalid" });
    expect(read({ ...session, iat: -1 })).toEqual({ failure: "invalid" });
    expect(read({ ...session, iat: 1.5 })).toEqual({ failure: "invalid" });
    expect(read({ ...session, exp: "later" })).toEqual({ failure: "invalid" });
    expect(read({ ...session, exp: NOW })).toEqual({ failure: "invalid" });
    expect(read([])).toEqual({ failure: "invalid" });
    expect(readSessionPayload("{not json", NOW)).toEqual({ failure: "invalid" });
  });

  it("is expired at its exp, not a second later (R19)", () => {
    expect(read(session, session.exp - 1)).toEqual({ ok: session });
    expect(read(session, session.exp)).toEqual({ failure: "expired" });
  });

  it("never carries the e-mail (decision of 2026-09-25)", () => {
    expect(Object.keys(session)).not.toContain("email");
    expect(Object.keys(login)).not.toContain("email");
  });
});

describe("reading a login payload", () => {
  const read = (value: unknown, now = NOW) => readLoginPayload(JSON.stringify(value), now);

  it("reads a good one, with and without the device id presented", () => {
    expect(read(login)).toEqual({ ok: login });
    const withDevice = loginPayload({
      state: ID43,
      nonce: ID43,
      verifier: ID43,
      did: ID22,
      now: NOW,
      ttlSeconds: 600,
    });
    expect(withDevice.did).toBe(ID22);
    expect(read(withDevice)).toEqual({ ok: withDevice });
  });

  it("refuses the session's typ, another flow, a short state and a bad device id", () => {
    expect(read({ ...login, typ: "atlas.session" })).toEqual({ failure: "invalid" });
    expect(read({ ...login, flow: "console" })).toEqual({ failure: "invalid" });
    expect(read({ ...login, state: "short" })).toEqual({ failure: "invalid" });
    expect(read({ ...login, nonce: 1 })).toEqual({ failure: "invalid" });
    expect(read({ ...login, verifier: undefined })).toEqual({ failure: "invalid" });
    expect(read({ ...login, did: "x" })).toEqual({ failure: "invalid" });
    expect(read({ ...login, extra: 1 })).toEqual({ failure: "invalid" });
    expect(read(login, login.exp)).toEqual({ failure: "expired" });
  });
});

describe("the identifiers and the view of the session (R23)", () => {
  it("checks the fixed lengths and the instants", () => {
    expect(isId22(ID22)).toBe(true);
    expect(isId22(`${ID22}:1`)).toBe(false);
    expect(isId22(1)).toBe(false);
    expect(isId43(ID43)).toBe(true);
    expect(isId43(`${ID43.slice(1)}/`)).toBe(false);
    expect(isInstant("2026-10-01T10:00:00Z")).toBe(true);
    expect(isInstant("2026-10-01T10:00:00.123Z")).toBe(true);
    expect(isInstant("2026-10-01T10:00:00+02:00")).toBe(false);
    expect(isInstant(5)).toBe(false);
    expect(instantOf(0)).toBe("1970-01-01T00:00:00Z");
    expect(isSubject("a".repeat(255))).toBe(true);
    expect(isSubject("a".repeat(256))).toBe(false);
  });

  it("says signed_in with the expiry and the device id of the cookie, and nothing else", () => {
    expect(sessionView(session)).toEqual({
      signed_in: true,
      expires_at: instantOf(session.exp),
      device_id: ID22B,
    });
  });

  it("keeps a presented device id only if well formed", () => {
    expect(presentedDeviceId(ID22)).toBe(ID22);
    expect(presentedDeviceId(`${ID22}x`)).toBeUndefined();
    expect(presentedDeviceId("../../x")).toBeUndefined();
    expect(presentedDeviceId(undefined)).toBeUndefined();
  });
});
