// The signed payloads and what the SPA learns of its session.

import { describe, expect, it } from "vitest";
import { instantOf, isId22, isId43 } from "../../src/access/ids.js";
import {
  closedByMark,
  parseSessionsValidFrom,
  serializeSessionsValidFrom,
  sessionView,
} from "../../src/access/session.js";
import {
  isSubject,
  loginPayload,
  readLoginPayload,
  readSessionPayload,
  SIGNING,
  sessionPayload,
  splitSigned,
} from "../../src/access/signed.js";
import { isInstant } from "../../src/guards.js";

const ID22 = "AAAAAAAAAAAAAAAAAAAAAA";
const ID43 = "C".repeat(43);
const NOW = 1_790_000_000;

const session = sessionPayload({
  sub: "1234567890",
  sid: ID22,
  now: NOW,
  ttlSeconds: 28_800,
});
const login = loginPayload({
  state: ID43,
  nonce: ID43,
  verifier: ID43,
  now: NOW,
  ttlSeconds: 600,
});

describe("the purposes of a signature (B3)", () => {
  it("gives each purpose its own HKDF info and its own typ", () => {
    const infos = Object.values(SIGNING).map((purpose) => purpose.info);
    const typs = Object.values(SIGNING).map((purpose) => purpose.typ);
    expect(new Set(infos).size).toBe(2);
    expect(new Set(typs).size).toBe(2);
    expect(SIGNING.session).toEqual({ info: "atlas session v1", typ: "atlas.session" });
    expect(SIGNING.login).toEqual({ info: "atlas login v1", typ: "atlas.login" });
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

  it("reads a good one", () => {
    expect(read(session)).toEqual({ ok: session });
    expect(session).toEqual({
      typ: "atlas.session",
      v: 1,
      sub: "1234567890",
      sid: ID22,
      iat: NOW,
      exp: NOW + 28_800,
    });
  });

  it("refuses another typ, another version, an unknown key, a missing field or a bad value", () => {
    expect(read({ ...session, typ: "atlas.login" })).toEqual({ failure: "invalid" });
    expect(read({ ...session, v: 2 })).toEqual({ failure: "invalid" });
    expect(read({ ...session, email: "a@b.c" })).toEqual({ failure: "invalid" });
    // The device id the cookie carried before every session could be closed at once.
    expect(read({ ...session, did: ID22 })).toEqual({ failure: "invalid" });
    expect(read({ ...session, sid: undefined })).toEqual({ failure: "invalid" });
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

  it("reads a good one", () => {
    expect(read(login)).toEqual({ ok: login });
  });

  it("refuses the session's typ, a short state and what it no longer carries", () => {
    expect(read({ ...login, typ: "atlas.session" })).toEqual({ failure: "invalid" });
    expect(read({ ...login, flow: "console" })).toEqual({ failure: "invalid" });
    expect(read({ ...login, state: "short" })).toEqual({ failure: "invalid" });
    expect(read({ ...login, nonce: 1 })).toEqual({ failure: "invalid" });
    expect(read({ ...login, verifier: undefined })).toEqual({ failure: "invalid" });
    expect(read({ ...login, did: ID22 })).toEqual({ failure: "invalid" });
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
    for (const impossible of [
      "2026-13-45T99:99:99Z",
      "2026-02-30T10:00:00Z",
      "2026-10-01T24:00:00Z",
    ]) {
      expect(isInstant(impossible)).toBe(false);
    }
    expect(isInstant(5)).toBe(false);
    expect(instantOf(0)).toBe("1970-01-01T00:00:00Z");
    expect(isSubject("a".repeat(255))).toBe(true);
    expect(isSubject("a".repeat(256))).toBe(false);
  });

  it("says signed_in with the expiry, and nothing else", () => {
    expect(sessionView(session)).toEqual({ signed_in: true, expires_at: instantOf(session.exp) });
  });
});

describe("the mark that closes every session (logout-all)", () => {
  it("closes a session issued strictly before it, and not one of the same second or later", () => {
    expect(closedByMark(NOW - 1, NOW)).toBe(true);
    // The sign-in right after closing everything: good at once.
    expect(closedByMark(NOW, NOW)).toBe(false);
    expect(closedByMark(NOW + 1, NOW)).toBe(false);
    expect(closedByMark(0, undefined)).toBe(false);
    // Only a write that meant to close them makes the object: unreadable fails closed.
    expect(closedByMark(NOW + 1, "unreadable")).toBe(true);
  });

  it("reads exactly what it writes, and nothing else", () => {
    expect(parseSessionsValidFrom(serializeSessionsValidFrom(NOW))).toBe(NOW);
    for (const text of [
      "{",
      "[]",
      "null",
      JSON.stringify({ sessions_valid_from_format: 2, at: NOW }),
      JSON.stringify({ sessions_valid_from_format: 1, at: "2026-11-03" }),
      JSON.stringify({ sessions_valid_from_format: 1, at: -1 }),
      JSON.stringify({ sessions_valid_from_format: 1, at: 1.5 }),
      JSON.stringify({ sessions_valid_from_format: 1, at: NOW, sub: "x" }),
      `{"sessions_valid_from_format":1,"at":1,"at":2}`,
    ]) {
      expect(parseSessionsValidFrom(text), text).toBe("unreadable");
    }
  });
});
