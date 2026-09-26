// Feature 015, E2: the sign-in of the console as rules (plan §4.2, T13 to
// T23): the start and each of its parameters, the name of a device, the
// literal loopback, the exchange, the attempt and the code signed apart, the
// entry of a `sub`, the reissue and the routes of the token.

import { describe, expect, it } from "vitest";
import {
  entryForSubject,
  isDeviceName,
  isPkceVerifier,
  loopbackCallback,
  parseConsoleStart,
  parseExchangeBody,
  reissueRefusal,
} from "../../src/access/console.js";
import { newDevice } from "../../src/access/device.js";
import { admit, findRoute, matchRoute, type RouteSpec } from "../../src/access/routes.js";
import {
  consoleCodePayload,
  consoleLoginPayload,
  loginPayload,
  readConsoleCodePayload,
  readLoginPayload,
} from "../../src/access/signed.js";

const S43 = "s".repeat(43);
const C43 = "c".repeat(43);
const ID = "RRRRRRRRRRRRRRRRRRRRRR";
const SELF = "https://atlas.example";

const start = (extra: Record<string, string> = {}, drop: string[] = []) =>
  parseConsoleStart(
    Object.entries({
      port: "49152",
      state: S43,
      code_challenge: C43,
      code_challenge_method: "S256",
      device_name: "portátil de casa",
      ...extra,
    }).filter(([name]) => !drop.includes(name)),
  );

describe("the name of a device (contracts §B)", () => {
  it("admits 1 to 40 code points of the closed alphabet, single spaces inside", () => {
    for (const good of [
      "a",
      "Portátil de Casa",
      "pc-2.oficina_1",
      "ÑÜÁÉÍÓÚ ñüáéíóú",
      "x".repeat(40),
    ]) {
      expect(isDeviceName(good)).toBe(true);
    }
    for (const bad of [
      "",
      " a",
      "a ",
      "a  b",
      "x".repeat(41),
      "a<b",
      "é".normalize("NFD"),
      "portátil​",
      "Ⅻ",
      "ç",
      7,
      undefined,
    ]) {
      expect(isDeviceName(bad)).toBe(false);
    }
  });
});

describe("GET /api/auth/console/start (docs/api.md §4.1; T13)", () => {
  it("reads a loopback start and a manual one, with the reissue if it comes", () => {
    expect(start()).toEqual({
      mode: "loopback",
      port: 49152,
      state: S43,
      code_challenge: C43,
      device_name: "portátil de casa",
    });
    expect(start({ mode: "manual", reissue_device_id: ID }, ["port"])).toEqual({
      mode: "manual",
      state: S43,
      code_challenge: C43,
      device_name: "portátil de casa",
      reissue_device_id: ID,
    });
    expect(start({ mode: "manual", port: "1024" })).toMatchObject({ port: 1024 });
  });

  it("refuses each parameter by its name, and opens nothing", () => {
    const cases: [Record<string, string>, string[], string][] = [
      [{ port: "1023" }, [], "port"],
      [{ port: "65536" }, [], "port"],
      [{ port: "0x50" }, [], "port"],
      [{ port: "049152" }, [], "port"],
      [{}, ["port"], "port"],
      [{ mode: "manual", port: "80" }, [], "port"],
      [{ mode: "browser" }, [], "mode"],
      [{ state: "short" }, [], "state"],
      [{}, ["state"], "state"],
      [{ code_challenge: "x" }, [], "code_challenge"],
      [{ code_challenge_method: "plain" }, [], "code_challenge_method"],
      [{}, ["code_challenge_method"], "code_challenge_method"],
      [{ device_name: "a<b" }, [], "device_name"],
      [{ reissue_device_id: `${ID}:1` }, [], "reissue_device_id"],
      [{ redirect_uri: "https://evil.example" }, [], "redirect_uri"],
    ];
    for (const [extra, drop, parameter] of cases) {
      expect(start(extra, drop)).toEqual({
        status: 400,
        code: "console_start_invalid",
        details: { parameter },
      });
    }
    expect(parseConsoleStart([...Object.entries({ port: "49152" }), ["port", "49153"]])).toEqual({
      status: 400,
      code: "console_start_invalid",
      details: { parameter: "port" },
    });
  });
});

describe("the loopback return (ADR-0033, point 4; T17)", () => {
  it("goes to the literal 127.0.0.1 and the validated port, nowhere else", () => {
    expect(loopbackCallback(49152, "abc.def", S43)).toBe(
      `http://127.0.0.1:49152/callback?code=abc.def&state=${S43}`,
    );
    for (const [port, code, state] of [
      [1023, "abc", S43],
      [65536, "abc", S43],
      [49152, "a b", S43],
      [49152, "abc&x=1", S43],
      [49152, "abc", "short"],
    ] as const) {
      expect(() => loopbackCallback(port, code, state)).toThrow(RangeError);
    }
  });
});

describe("the exchange (docs/api.md §4.3)", () => {
  it("takes the code and the verifier and nothing else — never a device id", () => {
    expect(parseExchangeBody({ code: "x.y", code_verifier: S43 })).toEqual({
      code: "x.y",
      code_verifier: S43,
    });
    expect(parseExchangeBody({ code: "x", code_verifier: S43, device_id: ID })).toMatchObject({
      code: "body_invalid",
      details: { reason: "fields" },
    });
    expect(parseExchangeBody([])).toMatchObject({ code: "body_invalid" });
    expect(parseExchangeBody({ code: "", code_verifier: S43 })).toMatchObject({
      details: { reason: "code" },
    });
    expect(parseExchangeBody({ code: 1, code_verifier: S43 })).toMatchObject({
      details: { reason: "code" },
    });
    expect(parseExchangeBody({ code: "x".repeat(8193), code_verifier: S43 })).toMatchObject({
      details: { reason: "code" },
    });
    expect(parseExchangeBody({ code: "x", code_verifier: "short" })).toMatchObject({
      details: { reason: "code_verifier" },
    });
    expect(isPkceVerifier("a~b.c_d-".padEnd(43, "e"))).toBe(true);
    expect(isPkceVerifier("e".repeat(129))).toBe(false);
  });

  it("finds the one entry of a code's sub, and chooses none among two (Q8 (a))", () => {
    const one = { sub: "1", email: "a@x.test" };
    expect(entryForSubject([one, { sub: "2", email: "b@x.test" }], "1")).toBe(one);
    expect(entryForSubject([one], "3")).toBe("missing");
    expect(entryForSubject([one, { sub: "1", email: "c@x.test" }], "1")).toBe("ambiguous");
  });
});

describe("the reissue (N5; R2-B1)", () => {
  const device = (type: "web" | "console", forgotten = false) => ({
    ...newDevice({ deviceId: ID, type, createdAt: "2026-10-01T10:00:00Z" }),
    ...(forgotten ? { state: "forgotten" as const, forgotten_at: "2026-10-02T10:00:00Z" } : {}),
  });

  it("is allowed only for a device that exists, is a console and is not forgotten, each failure apart", () => {
    expect(reissueRefusal(device("console"))).toBeUndefined();
    expect(reissueRefusal(undefined)).toBe("reissue_device_missing");
    expect(reissueRefusal("unreadable")).toBe("reissue_device_unreadable");
    expect(reissueRefusal(device("web"))).toBe("reissue_device_not_console");
    expect(reissueRefusal(device("console", true))).toBe("reissue_device_forgotten");
  });
});

describe("the attempt of the console and its code, signed apart (B3; T16, T20)", () => {
  const NOW = 1_790_000_000;
  const consoleStart = {
    mode: "loopback" as const,
    port: 49152,
    state: S43,
    code_challenge: C43,
    device_name: "casa",
  };

  it("reads back an attempt of the console, and never mixes it with the web's", () => {
    const attempt = consoleLoginPayload({
      state: S43,
      nonce: S43,
      verifier: S43,
      console: consoleStart,
      now: NOW,
      ttlSeconds: 600,
    });
    expect(readLoginPayload(JSON.stringify(attempt), NOW)).toEqual({ ok: attempt });
    const web = loginPayload({
      state: S43,
      nonce: S43,
      verifier: S43,
      did: ID,
      now: NOW,
      ttlSeconds: 600,
    });
    const mixes = [
      { ...attempt, did: ID },
      { ...web, console: consoleStart },
      { ...attempt, console: { ...consoleStart, port: 80 } },
      { ...attempt, console: { ...consoleStart, mode: "loopback", port: undefined } },
      { ...attempt, console: { ...consoleStart, extra: 1 } },
      { ...attempt, console: { ...consoleStart, device_name: "a  b" } },
      { ...attempt, console: { ...consoleStart, reissue_device_id: "x" } },
      { ...attempt, console: "loopback" },
      { ...attempt, flow: "cli" },
    ];
    for (const value of mixes) {
      expect(readLoginPayload(JSON.stringify(value), NOW)).toEqual({ failure: "invalid" });
    }
    const manual = consoleLoginPayload({
      state: S43,
      nonce: S43,
      verifier: S43,
      console: {
        mode: "manual",
        state: S43,
        code_challenge: C43,
        device_name: "casa",
        reissue_device_id: ID,
      },
      now: NOW,
      ttlSeconds: 600,
    });
    expect(readLoginPayload(JSON.stringify(manual), NOW)).toEqual({ ok: manual });
  });

  it("reads a code of the console with its own typ, and nothing that is not one", () => {
    const code = consoleCodePayload({
      tokenId: ID,
      codeChallenge: C43,
      sub: "108234567890123456789",
      deviceName: "casa",
      reissueDeviceId: undefined,
      now: NOW,
      ttlSeconds: 300,
    });
    expect(code).not.toHaveProperty("email");
    expect(readConsoleCodePayload(JSON.stringify(code), NOW)).toEqual({ ok: code });
    expect(readConsoleCodePayload(JSON.stringify(code), NOW + 300)).toEqual({ failure: "expired" });
    const reissue = consoleCodePayload({
      tokenId: ID,
      codeChallenge: C43,
      sub: "108234567890123456789",
      deviceName: "casa",
      reissueDeviceId: ID,
      now: NOW,
      ttlSeconds: 300,
    });
    expect(reissue.rdid).toBe(ID);
    expect(readConsoleCodePayload(JSON.stringify(reissue), NOW)).toEqual({ ok: reissue });
    for (const value of [
      { ...code, typ: "atlas.session" },
      { ...code, email: "user@example.test" },
      { ...code, tid: "x" },
      { ...code, cc: "x" },
      { ...code, sub: "" },
      { ...code, dn: " casa" },
      { ...code, rdid: "x" },
    ]) {
      expect(readConsoleCodePayload(JSON.stringify(value), NOW)).toEqual({ failure: "invalid" });
    }
    // A session is not a code, even if its bytes were somehow opened with this subkey.
    const session = {
      typ: "atlas.session",
      v: 1,
      sub: "1",
      sid: ID,
      did: ID,
      iat: NOW,
      exp: NOW + 5,
    };
    expect(readConsoleCodePayload(JSON.stringify(session), NOW)).toEqual({ failure: "invalid" });
  });
});

describe("the routes of the token (docs/api.md §2.3; T11, T14)", () => {
  const at = (method: string, path: string) => findRoute(method, path) as RouteSpec;
  const token = { kind: "token", value: "atlasdt1.x" } as const;
  const session = { kind: "session", value: "s" } as const;
  const none = { kind: "none" } as const;

  it("matches the revoke of the web by its segment, and nothing longer or empty", () => {
    expect(matchRoute("POST", `/api/devices/tokens/${ID}/revoke`)).toMatchObject({
      route: { policy: "session", writes: true },
      params: { token_id: ID },
    });
    expect(matchRoute("POST", "/api/devices/tokens//revoke")).toBeUndefined();
    expect(matchRoute("POST", `/api/devices/tokens/${ID}/x/revoke`)).toBeUndefined();
    expect(matchRoute("GET", `/api/devices/tokens/${ID}/revoke`)).toBeUndefined();
    expect(matchRoute("POST", `/api/devices/tokens/${ID}/revoked`)).toBeUndefined();
  });

  it("opens no attempt with a token, and ignores a cookie there", () => {
    const route = at("GET", "/api/auth/console/start");
    expect(admit(route, token, undefined, SELF)).toMatchObject({
      kind: "refused",
      refusal: { code: "forbidden_for_credential" },
    });
    expect(admit(route, session, undefined, SELF)).toEqual({ kind: "anonymous" });
    expect(admit(route, none, undefined, SELF)).toEqual({ kind: "anonymous" });
    expect(admit(route, { kind: "ambiguous" }, undefined, SELF)).toMatchObject({
      refusal: { code: "credentials_ambiguous" },
    });
  });

  it("exchanges with no credential or with the previous token, never with the cookie", () => {
    const route = at("POST", "/api/auth/console/token");
    expect(admit(route, none, undefined, SELF)).toEqual({ kind: "anonymous" });
    expect(admit(route, token, undefined, SELF)).toEqual(token);
    expect(admit(route, session, SELF, SELF)).toMatchObject({
      refusal: { code: "forbidden_for_credential" },
    });
    expect(admit(route, { kind: "session_repeated" }, SELF, SELF)).toMatchObject({
      refusal: { code: "forbidden_for_credential" },
    });
  });

  it("revokes its own token only with the token", () => {
    const route = at("POST", "/api/auth/console/revoke");
    expect(admit(route, token, undefined, SELF)).toEqual(token);
    expect(admit(route, none, undefined, SELF)).toMatchObject({
      refusal: { code: "unauthenticated" },
    });
    expect(admit(route, session, SELF, SELF)).toMatchObject({
      refusal: { code: "forbidden_for_credential" },
    });
  });

  it("lists and revokes any token only with the session (mutant 26)", () => {
    for (const route of [
      at("GET", "/api/devices/tokens"),
      at("POST", `/api/devices/tokens/${ID}/revoke`),
    ]) {
      expect(admit(route, token, SELF, SELF)).toMatchObject({
        refusal: { code: "forbidden_for_credential" },
      });
      expect(admit(route, session, SELF, SELF)).toEqual(session);
    }
  });
});
