// Feature 015, E1: the sign-in of the web with Google by way c, the session
// and the device of the web (plan §4.1, R06 to R23 and R31), walked end to
// end against the doubles of Google, SSM and S3.

import { createHmac } from "node:crypto";
import { base64url, pkceChallenge, Signer } from "@atlas/adapters/access";
import { newDevice, serializeDeviceObject } from "@atlas/domain/access";
import { describe, expect, it } from "vitest";
import {
  ALLOWED,
  allowListOf,
  errorOf,
  NAMES,
  SELF,
  SESSION_KEY,
  STRANGER,
  setCookies,
  setup,
} from "./harness.js";

const DAY = 24 * 3600 * 1000;

const attributes = (cookie: string): string[] => cookie.split(";").map((part) => part.trim());
const setCookieOf = (cookies: readonly string[] | undefined, name: string): string =>
  (cookies ?? []).find((cookie) => cookie.startsWith(`${name}=`)) as string;

describe("GET /api/auth/login", () => {
  it("opens the attempt in a signed transient cookie and redirects to the provider with PKCE", async () => {
    const api = setup();
    const start = await api.call("GET", "/api/auth/login");
    expect(start.statusCode).toBe(302);
    const location = new URL(start.headers.location as string);
    expect(location.searchParams.get("client_id")).toBe("client-dev");
    expect(location.searchParams.get("redirect_uri")).toBe(`${SELF}/api/auth/callback`);
    const login = setCookieOf(start.cookies, "__Host-atlas_login");
    // R07: Lax, so that the return from Google brings it; never Strict.
    expect(attributes(login).slice(1)).toEqual([
      "Path=/",
      "Secure",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=600",
    ]);
    const payload = JSON.parse(
      Signer.fromSessionKey(SESSION_KEY).open(
        "login",
        login.split(";")[0]?.split("=")[1] as string,
      ) as string,
    );
    expect(payload.state).toBe(location.searchParams.get("state"));
    expect(payload.nonce).toBe(location.searchParams.get("nonce"));
    expect(pkceChallenge(payload.verifier)).toBe(location.searchParams.get("code_challenge"));
    expect(Object.keys(payload)).not.toContain("email");
  });
});

describe("GET /api/auth/callback, the branch of the web (R06 to R17)", () => {
  it("issues the session cookie with every attribute of ADR-0027, and clears the attempt", async () => {
    const api = setup();
    const { done } = await api.signIn();
    expect(done.statusCode).toBe(302);
    expect(done.headers.location).toBe(`${SELF}/ajustes#sincronizacion`);
    const session = setCookieOf(done.cookies, "__Host-atlas_session");
    expect(attributes(session).slice(1)).toEqual([
      "Path=/",
      "Secure",
      "HttpOnly",
      "SameSite=Strict",
      "Max-Age=28800",
    ]);
    expect(session).not.toMatch(/Domain=/i);
    expect(setCookieOf(done.cookies, "__Host-atlas_login")).toContain("Max-Age=0");
    const payload = JSON.parse(
      Signer.fromSessionKey(SESSION_KEY).open("session", api.session() as string) as string,
    );
    expect(Object.keys(payload).sort()).toEqual(["did", "exp", "iat", "sid", "sub", "typ", "v"]);
    expect(payload.sub).toBe(ALLOWED.sub);
    expect(JSON.stringify(payload)).not.toContain(ALLOWED.email);
  });

  it("refuses a state that is not the attempt's, before exchanging the code (R09)", async () => {
    const api = setup();
    const start = await api.call("GET", "/api/auth/login");
    const back = api.google.authorize(start.headers.location as string, ALLOWED);
    const done = await api.call("GET", "/api/auth/callback", {
      query: { code: back.code, state: "x".repeat(43) },
    });
    expect(done.statusCode).toBe(400);
    expect(done.body).toContain("login_state_mismatch");
    expect(api.google.exchanges).toBe(0);
    expect(api.session()).toBeUndefined();
  });

  it("refuses a return without its attempt, with a forged one, or with an expired one", async () => {
    const api = setup();
    const start = await api.call("GET", "/api/auth/login");
    const back = api.google.authorize(start.headers.location as string, ALLOWED);
    const noJar = await api.call("GET", "/api/auth/callback", {
      query: { code: back.code, state: back.state },
      jar: false,
    });
    expect(noJar.body).toContain("login_attempt_missing");
    const forged = await api.call("GET", "/api/auth/callback", {
      query: { code: back.code, state: back.state },
      jar: false,
      cookies: [
        `__Host-atlas_login=${Signer.fromSessionKey(base64url(Buffer.alloc(32, 1))).sign("login", {})}`,
      ],
    });
    expect(forged.body).toContain("login_attempt_invalid");
    const twice = await api.call("GET", "/api/auth/callback", {
      query: { code: back.code, state: back.state },
      cookies: [`__Host-atlas_login=${api.jar.get("__Host-atlas_login")}`],
    });
    expect(twice.body).toContain("login_attempt_invalid");
    api.advance(600_000);
    const late = await api.call("GET", "/api/auth/callback", {
      query: { code: back.code, state: back.state },
    });
    expect(late.body).toContain("login_attempt_missing");
    expect(api.google.exchanges).toBe(0);
  });

  it("is single use: the browser drops the attempt, and a replayed one gets no second session (R07)", async () => {
    const api = setup();
    const start = await api.call("GET", "/api/auth/login");
    const attempt = api.jar.get("__Host-atlas_login") as string;
    const back = api.google.authorize(start.headers.location as string, ALLOWED);
    await api.call("GET", "/api/auth/callback", { query: { code: back.code, state: back.state } });
    const again = await api.call("GET", "/api/auth/callback", {
      query: { code: back.code, state: back.state },
      jar: false,
      cookies: [`__Host-atlas_login=${attempt}`],
    });
    expect(again.statusCode).not.toBe(302);
    expect(again.body).toContain("google_exchange_failed");
  });

  it("exchanges with the PKCE verifier of the attempt: the provider refuses any other (R10)", async () => {
    const api = setup();
    const start = await api.call("GET", "/api/auth/login");
    const url = new URL(start.headers.location as string);
    url.searchParams.set("code_challenge", pkceChallenge("another-verifier"));
    const back = api.google.authorize(url.toString(), ALLOWED);
    const done = await api.call("GET", "/api/auth/callback", {
      query: { code: back.code, state: back.state },
    });
    expect(done.statusCode).toBe(503);
    expect(done.body).toContain("google_exchange_failed");
  });

  it("refuses an error from the provider, a missing code and a provider that is down", async () => {
    const api = setup();
    const start = await api.call("GET", "/api/auth/login");
    const back = api.google.authorize(start.headers.location as string, ALLOWED);
    expect(
      (
        await api.call("GET", "/api/auth/callback", {
          query: { state: back.state, error: "access_denied" },
        })
      ).body,
    ).toContain("google_error");
    const start2 = await api.call("GET", "/api/auth/login");
    const back2 = api.google.authorize(start2.headers.location as string, ALLOWED);
    expect(
      (await api.call("GET", "/api/auth/callback", { query: { state: back2.state } })).body,
    ).toContain("google_error");
    const start3 = await api.call("GET", "/api/auth/login");
    const back3 = api.google.authorize(start3.headers.location as string, ALLOWED);
    api.google.down = true;
    const down = await api.call("GET", "/api/auth/callback", {
      query: { code: back3.code, state: back3.state },
    });
    expect(down.statusCode).toBe(503);
    expect(down.body).toContain("google_exchange_failed");
  });

  const refusedWith = async (claims: Record<string, unknown>, code: string) => {
    const api = setup();
    api.google.nextClaims = claims;
    const { done } = await api.signIn();
    expect(done.statusCode).not.toBe(302);
    expect(done.body).toContain(`<code>${code}</code>`);
    expect(api.session()).toBeUndefined();
    expect(api.s3.keys()).toEqual([]);
  };

  it("refuses the audience of another environment (R12)", () =>
    refusedWith({ aud: "client-prod" }, "id_token_audience"));
  it("refuses another issuer (R13)", () =>
    refusedWith({ iss: "https://fake-idp.test.evil" }, "id_token_issuer"));
  it("refuses an expired token (R14)", () =>
    refusedWith({ exp: Math.floor(Date.UTC(2026, 9, 1, 9) / 1000) }, "id_token_expired"));
  it("refuses another nonce (R15)", () => refusedWith({ nonce: "n".repeat(43) }, "id_token_nonce"));
  it("refuses an address that is not verified (R16)", () =>
    refusedWith({ email_verified: false }, "email_not_verified"));

  it("refuses a sub of the list with another e-mail, and the other way round (R17)", async () => {
    for (const account of [
      { sub: ALLOWED.sub, email: STRANGER.email },
      { sub: STRANGER.sub, email: ALLOWED.email },
    ]) {
      const api = setup();
      const { done } = await api.signIn(account);
      expect(done.statusCode).toBe(403);
      expect(done.body).toContain("Acceso denegado");
      expect(api.session()).toBeUndefined();
    }
  });

  it("refuses a token signed with another key, with alg none, with HS256 or an unknown kid (R11)", async () => {
    const forge = (make: (api: ReturnType<typeof setup>, nonce: string) => string) => async () => {
      const api = setup();
      const start = await api.call("GET", "/api/auth/login");
      const nonce = new URL(start.headers.location as string).searchParams.get("nonce") as string;
      const back = api.google.authorize(start.headers.location as string, ALLOWED);
      const claims = {
        iss: "https://fake-idp.test",
        aud: "client-dev",
        sub: ALLOWED.sub,
        email: ALLOWED.email,
        email_verified: true,
        nonce,
        exp: Math.floor(api.nowMs() / 1000) + 600,
      };
      const forged = make(api, JSON.stringify(claims));
      api.google.exchangeCode = async () => forged;
      const done = await api.call("GET", "/api/auth/callback", {
        query: { code: back.code, state: back.state },
      });
      expect(done.body).toContain("<code>id_token_invalid</code>");
      expect(api.session()).toBeUndefined();
    };
    const b64 = (text: string) => Buffer.from(text).toString("base64url");
    await forge((_, claims) => `${b64('{"alg":"none","kid":"fake-k1"}')}.${b64(claims)}.`)();
    await forge((_, claims) => `${b64('{"alg":"none","kid":"fake-k1"}')}.${b64(claims)}.AAAA`)();
    await forge((api, claims) => {
      const input = `${b64('{"alg":"HS256","kid":"fake-k1"}')}.${b64(claims)}`;
      return `${input}.${createHmac("sha256", JSON.stringify(api.google.publicJwk)).update(input).digest("base64url")}`;
    })();
    await forge((api, claims) =>
      api.google.token({ alg: "RS256", kid: "unknown-kid" }, JSON.parse(claims)),
    )();
    await forge((api, claims) => {
      const token = api.google.token({ alg: "RS256", kid: "fake-k1" }, JSON.parse(claims));
      return `${token.slice(0, -4)}AAAA`;
    })();
    await forge(() => "not-a-jwt")();
  });

  it("shows the access-denied page with the sub just authenticated, never the e-mail (R22)", async () => {
    const api = setup();
    const { done } = await api.signIn(STRANGER);
    expect(done.statusCode).toBe(403);
    expect(done.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(done.headers["cache-control"]).toBe("no-store");
    expect(done.headers["referrer-policy"]).toBe("no-referrer");
    expect(done.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(done.body).toContain(STRANGER.sub);
    expect(done.body).not.toContain(STRANGER.email);
    expect(done.body).not.toMatch(/<script/i);
    expect(done.headers.location).toBeUndefined();
    expect(api.logs.join("\n")).not.toContain(STRANGER.sub);
  });

  it("shows the sub of this sign-in even with another account's session in the jar", async () => {
    const api = setup();
    await api.signIn(ALLOWED);
    const { done } = await api.signIn(STRANGER);
    expect(done.body).toContain(STRANGER.sub);
    expect(done.body).not.toContain(ALLOWED.sub);
  });

  it("escapes a sub the page shows", async () => {
    const api = setup();
    const { done } = await api.signIn({ sub: "<b>x&y</b>", email: "e@example.test" });
    expect(done.body).toContain("&lt;b&gt;x&amp;y&lt;/b&gt;");
  });
});

describe("the device of the web (R20, R21)", () => {
  it("assigns a new device the first time, with its object, and GET /api/session says which (R23)", async () => {
    const api = setup();
    await api.signIn();
    const view = await api.call("GET", "/api/session");
    expect(view.statusCode).toBe(200);
    expect(view.headers["cache-control"]).toBe("no-store");
    const body = JSON.parse(view.body);
    expect(Object.keys(body).sort()).toEqual(["device_id", "expires_at", "signed_in"]);
    expect(body.signed_in).toBe(true);
    expect(body.expires_at).toBe("2026-10-01T18:00:00Z");
    expect(api.s3.keys()).toEqual([`sync/devices/${body.device_id}.json`]);
    expect(JSON.parse(api.s3.text(`sync/devices/${body.device_id}.json`) as string)).toMatchObject({
      type: "web",
      state: "active",
    });
  });

  it("keeps a presented id the API issued for a live web device", async () => {
    const api = setup();
    await api.signIn();
    const first = JSON.parse((await api.call("GET", "/api/session")).body).device_id;
    api.jar.clear();
    await api.signIn(ALLOWED, first);
    expect(JSON.parse((await api.call("GET", "/api/session")).body).device_id).toBe(first);
    expect(api.s3.keys()).toHaveLength(1);
  });

  it("assigns a new one for an id it never issued, a forgotten one, a console's or a malformed one (R20)", async () => {
    const api = setup();
    const forgotten = "FFFFFFFFFFFFFFFFFFFFFF";
    const console_ = "CCCCCCCCCCCCCCCCCCCCCC";
    api.s3.seed(
      `sync/devices/${forgotten}.json`,
      serializeDeviceObject({
        ...newDevice({ deviceId: forgotten, type: "web", createdAt: "2026-09-01T10:00:00Z" }),
        state: "forgotten",
        forgotten_at: "2026-09-02T10:00:00Z",
      }),
    );
    api.s3.seed(
      `sync/devices/${console_}.json`,
      serializeDeviceObject(
        newDevice({
          deviceId: console_,
          type: "console",
          createdAt: "2026-09-01T10:00:00Z",
          deviceName: "portátil",
        }),
      ),
    );
    for (const presented of [
      "NNNNNNNNNNNNNNNNNNNNNN",
      forgotten,
      console_,
      "../../ledger/ledger",
    ]) {
      api.jar.clear();
      await api.signIn(ALLOWED, presented);
      const view = await api.call("GET", "/api/session");
      expect(view.statusCode).toBe(200);
      const assigned = JSON.parse(view.body).device_id as string;
      expect(assigned).not.toBe(presented);
      expect(JSON.parse(api.s3.text(`sync/devices/${assigned}.json`) as string)).toMatchObject({
        type: "web",
        state: "active",
      });
    }
    expect(api.s3.text(`sync/devices/${forgotten}.json`)).toContain('"forgotten"');
    expect(api.s3.calls.some((call) => call.includes(".."))).toBe(false);
  });

  it("never takes the device from the query, a header or the body of a request (R20)", async () => {
    const api = setup();
    await api.signIn();
    const mine = JSON.parse((await api.call("GET", "/api/session")).body).device_id;
    const other = "OOOOOOOOOOOOOOOOOOOOOO";
    const tried = await api.call("GET", "/api/session", {
      query: { device_id: other },
      headers: { "x-atlas-device-id": other },
    });
    expect(JSON.parse(tried.body).device_id).toBe(mine);
  });

  it("refuses every request of a session whose device was forgotten, removed or retyped (R21)", async () => {
    for (const [change, reason] of [
      ["forgotten", "forgotten"],
      ["missing", "missing"],
      ["retyped", "wrong_type"],
      ["damaged", "unreadable"],
    ] as const) {
      const api = setup();
      await api.signIn();
      const deviceId = JSON.parse((await api.call("GET", "/api/session")).body).device_id as string;
      const key = `sync/devices/${deviceId}.json`;
      const object = JSON.parse(api.s3.text(key) as string);
      if (change === "forgotten")
        api.s3.seed(
          key,
          JSON.stringify({ ...object, state: "forgotten", forgotten_at: "2026-10-01T11:00:00Z" }),
        );
      if (change === "missing") api.s3.deleteOutOfBand(key);
      if (change === "retyped") api.s3.seed(key, JSON.stringify({ ...object, type: "console" }));
      if (change === "damaged") api.s3.seed(key, "{");
      const refused = await api.call("GET", "/api/session");
      expect(refused.statusCode).toBe(403);
      expect(errorOf(refused)).toEqual({ code: "device_forgotten", details: { reason } });
    }
  });
});

describe("a request with the session (R18, R19, R23, R31)", () => {
  it("asks the allow list again once its cache expires, never later (R18)", async () => {
    const api = setup();
    await api.signIn();
    api.ssm.set(NAMES.allowList, allowListOf());
    expect((await api.call("GET", "/api/session")).statusCode).toBe(200);
    api.advance(119_000);
    expect((await api.call("GET", "/api/session")).statusCode).toBe(200);
    api.advance(1_000);
    const refused = await api.call("GET", "/api/session");
    expect(refused.statusCode).toBe(403);
    expect(errorOf(refused).code).toBe("not_allowed");
  });

  it("expires the session at its time, without renewal (R19)", async () => {
    const api = setup();
    await api.signIn();
    api.advance(28_800_000 - 1_000);
    expect((await api.call("GET", "/api/session")).statusCode).toBe(200);
    api.advance(1_000);
    const expired = await api.call("GET", "/api/session");
    expect(errorOf(expired)).toEqual({ code: "session_invalid", details: { reason: "expired" } });
  });

  it("says session_invalid for a forged cookie, one of another purpose and a repeated one (R23, M12 ter)", async () => {
    const api = setup();
    await api.signIn();
    const other = Signer.fromSessionKey(base64url(Buffer.alloc(32, 9)));
    const signer = Signer.fromSessionKey(SESSION_KEY);
    const good = JSON.parse(signer.open("session", api.session() as string) as string);
    for (const [cookie, reason] of [
      [other.sign("session", good), "signature"],
      [signer.sign("login", good), "signature"],
      [signer.sign("console_code", good), "signature"],
      [signer.sign("session", { ...good, typ: "atlas.login" }), "invalid"],
    ] as const) {
      const refused = await api.call("GET", "/api/session", {
        jar: false,
        cookies: [`__Host-atlas_session=${cookie}`],
      });
      expect(errorOf(refused)).toEqual({ code: "session_invalid", details: { reason } });
    }
    const repeated = await api.call("GET", "/api/session", {
      cookies: [`__Host-atlas_session=${api.session()}`],
    });
    expect(errorOf(repeated)).toEqual({ code: "session_invalid", details: { reason: "repeated" } });
  });

  it("closes every session when the session key is rotated and its cache expires (B3, step 4)", async () => {
    const api = setup();
    await api.signIn();
    api.ssm.set(NAMES.sessionKey, base64url(Buffer.alloc(32, 99)));
    expect((await api.call("GET", "/api/session")).statusCode).toBe(200);
    api.advance(300_000);
    expect(errorOf(await api.call("GET", "/api/session"))).toEqual({
      code: "session_invalid",
      details: { reason: "signature" },
    });
  });

  it("answers 503 remote_unavailable when SSM or S3 fail, and lets nobody through (R31)", async () => {
    const api = setup();
    await api.signIn();
    api.advance(DAY / 24);
    api.ssm.throttleNext();
    const throttled = await api.call("GET", "/api/session");
    expect(throttled.statusCode).toBe(503);
    expect(throttled.headers["retry-after"]).toBe("5");
    expect(errorOf(throttled)).toEqual({
      code: "remote_unavailable",
      details: { dependency: "ssm" },
    });
    api.s3.failNext();
    expect(errorOf(await api.call("GET", "/api/session"))).toEqual({
      code: "remote_unavailable",
      details: { dependency: "s3" },
    });
    expect((await api.call("GET", "/api/session")).statusCode).toBe(200);
  });

  it("shows the error page when SSM fails during a sign-in", async () => {
    const api = setup();
    api.ssm.throttleNext();
    const start = await api.call("GET", "/api/auth/login");
    expect(start.statusCode).toBe(503);
    expect(start.body).toContain("<code>remote_unavailable</code>");
    expect(start.headers["content-security-policy"]).toContain("default-src 'none'");
    // N2 of the review of PR #90: the page says when to try again, as the JSON does.
    expect(start.headers["retry-after"]).toBe("5");
  });

  it("answers an unexpected failure of the return with the error page, and clears the attempt (N1, S1)", async () => {
    for (const breakIt of ["s3_throws", "collision", "bad_session_key"] as const) {
      const api = setup(
        breakIt === "s3_throws"
          ? {
              objects: {
                get: async () => undefined,
                putIfNoneMatch: async () => {
                  throw new Error("AccessDenied from an SDK that did not translate it");
                },
                putIfMatch: async () => "written",
              },
            }
          : breakIt === "collision"
            ? {
                objects: {
                  get: async () => undefined,
                  putIfNoneMatch: async () => "exists",
                  putIfMatch: async () => "written",
                },
              }
            : {},
      );
      const start = await api.call("GET", "/api/auth/login");
      const back = api.google.authorize(start.headers.location as string, ALLOWED);
      if (breakIt === "bad_session_key") {
        api.ssm.set(NAMES.sessionKey, "short");
        api.advance(300_000);
      }
      const done = await api.call("GET", "/api/auth/callback", {
        query: { code: back.code, state: back.state },
      });
      expect(done.statusCode).toBe(500);
      expect(done.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(done.body).toContain("<code>internal</code>");
      expect(done.body).not.toContain("AccessDenied");
      expect(setCookieOf(done.cookies, "__Host-atlas_login")).toContain("Max-Age=0");
      expect(api.session()).toBeUndefined();
    }
  });

  it("answers an unexpected failure of the start with the error page too", async () => {
    const api = setup();
    api.ssm.set(NAMES.sessionKey, "short");
    const start = await api.call("GET", "/api/auth/login");
    expect(start.statusCode).toBe(500);
    expect(start.body).toContain("<code>internal</code>");
    expect(start.headers.location).toBeUndefined();
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session without checking it, with its Origin and an empty body", async () => {
    const api = setup();
    await api.signIn();
    const out = await api.call("POST", "/api/auth/logout", {
      headers: { origin: SELF, "content-type": "application/json" },
      body: "{}",
    });
    expect(out.statusCode).toBe(204);
    expect(setCookies(out).get("__Host-atlas_session")).toBe("");
    expect(setCookieOf(out.cookies, "__Host-atlas_session")).toContain("Max-Age=0");
    expect(errorOf(await api.call("GET", "/api/session")).code).toBe("unauthenticated");
  });

  it("clears a cookie of a rotated key too, and answers 204 without any cookie", async () => {
    const api = setup();
    const forged = Signer.fromSessionKey(base64url(Buffer.alloc(32, 3))).sign("session", {});
    const out = await api.call("POST", "/api/auth/logout", {
      cookies: [`__Host-atlas_session=${forged}`],
      headers: { origin: SELF, "content-type": "application/json" },
      body: "{}",
    });
    expect(out.statusCode).toBe(204);
    const none = await api.call("POST", "/api/auth/logout", {
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(none.statusCode).toBe(204);
  });

  it("wants exactly {}", async () => {
    const api = setup();
    const out = await api.call("POST", "/api/auth/logout", {
      headers: { "content-type": "application/json" },
      body: '{"device_id":"x"}',
    });
    expect(errorOf(out)).toEqual({ code: "body_invalid", details: { reason: "not_empty_object" } });
  });
});
