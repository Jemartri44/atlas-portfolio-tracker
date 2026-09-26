// Feature 015, E2: the token of the console through the API (plan §4.2, T13
// to T26), walked end to end against the doubles of Google, SSM and S3: the
// start, the return by loopback and by hand, the exchange and its single use,
// the check of a token on every request, the renewal, the reissue, the
// revocation and the list of the web.

import { randomBytes } from "node:crypto";
import { base64url, pkceChallenge, Signer } from "@atlas/adapters/access";
import { newDevice, serializeDeviceObject } from "@atlas/domain/access";
import { describe, expect, it } from "vitest";
import {
  ALLOWED,
  allowListOf,
  errorOf,
  NAMES,
  SESSION_KEY,
  STRANGER,
  setCookies,
  setup,
} from "./harness.js";

const DAY = 86_400_000;
const PORT = "49152";
const TOKENS = "/atlas/dev/device-tokens/";
type Api = ReturnType<typeof setup>;

/** What `atlas remote login` keeps to itself: its `state` and its PKCE verifier. */
const consoleSecrets = () => {
  const verifier = base64url(randomBytes(32));
  return { state: base64url(randomBytes(32)), verifier, challenge: pkceChallenge(verifier) };
};

const startQuery = (
  secrets: ReturnType<typeof consoleSecrets>,
  extra: Record<string, string> = {},
): Record<string, string> => ({
  port: PORT,
  state: secrets.state,
  code_challenge: secrets.challenge,
  code_challenge_method: "S256",
  device_name: "portátil de casa",
  ...extra,
});

/** The start and the return through the provider: what the browser of the user does. */
const consoleReturn = async (
  api: Api,
  extra: Record<string, string> = {},
  secrets = consoleSecrets(),
  account: typeof ALLOWED = ALLOWED,
) => {
  const start = await api.call("GET", "/api/auth/console/start", {
    query: startQuery(secrets, extra),
    jar: true,
  });
  const back = api.google.authorize(start.headers.location as string, account);
  const done = await api.call("GET", "/api/auth/callback", {
    query: { code: back.code, state: back.state },
  });
  return { start, done, secrets };
};

const codeOfLoopback = (location: string): string =>
  new URL(location).searchParams.get("code") as string;

/** The code as the user copies it: `<wbr>` breaks the line on a phone and adds nothing to the text. */
const codeOfPage = (html: string): string =>
  String(/<\/summary>[\s\S]*<code>([\s\S]+?)<\/code>/.exec(html)?.[1]).replaceAll("<wbr>", "");

const exchange = (api: Api, code: string, verifier: string, headers: Record<string, string> = {}) =>
  api.call("POST", "/api/auth/console/token", {
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ code, code_verifier: verifier }),
    jar: false,
  });

/** A whole `atlas remote login`, by loopback: the token and what the API answered. */
const login = async (api: Api, extra: Record<string, string> = {}, headers = {}) => {
  const { done, secrets } = await consoleReturn(api, extra);
  const answer = await exchange(
    api,
    codeOfLoopback(done.headers.location as string),
    secrets.verifier,
    headers,
  );
  return { answer, body: JSON.parse(answer.body) as Record<string, string> };
};

const withToken = (api: Api, path: string, token: string, method = "POST") =>
  api.call(method, path, {
    headers: { "x-atlas-device-token": token, "content-type": "application/json" },
    ...(method === "POST" ? { body: "{}" } : {}),
    jar: false,
  });

describe("GET /api/auth/console/start (§4.1; T13 to T15)", () => {
  it("opens the attempt of the console and asks Google for the interactive screen", async () => {
    const api = setup();
    const secrets = consoleSecrets();
    const start = await api.call("GET", "/api/auth/console/start", { query: startQuery(secrets) });
    expect(start.statusCode).toBe(302);
    const location = new URL(start.headers.location as string);
    expect(location.searchParams.get("prompt")).toBe("select_account");
    // The Lambda's own PKCE towards Google, never the console's challenge.
    expect(location.searchParams.get("code_challenge")).not.toBe(secrets.challenge);
    const login = setCookies(start).get("__Host-atlas_login") as string;
    const payload = JSON.parse(Signer.fromSessionKey(SESSION_KEY).open("login", login) as string);
    expect(payload).toMatchObject({
      flow: "console",
      console: {
        mode: "loopback",
        port: 49152,
        state: secrets.state,
        code_challenge: secrets.challenge,
      },
    });
    expect(payload).not.toHaveProperty("did");
  });

  it("refuses each parameter by name and opens no attempt", async () => {
    const api = setup();
    for (const [extra, parameter] of [
      [{ port: "80" }, "port"],
      [{ code_challenge_method: "plain" }, "code_challenge_method"],
      [{ device_name: "<script>" }, "device_name"],
      [{ reissue_device_id: "../x" }, "reissue_device_id"],
    ] as const) {
      const answer = await api.call("GET", "/api/auth/console/start", {
        query: startQuery(consoleSecrets(), extra),
      });
      expect(answer.statusCode).toBe(400);
      expect(errorOf(answer)).toEqual({ code: "console_start_invalid", details: { parameter } });
      expect(answer.cookies ?? []).toEqual([]);
    }
  });

  it("opens no attempt with a token (mutant 26)", async () => {
    const api = setup();
    const answer = await api.call("GET", "/api/auth/console/start", {
      query: startQuery(consoleSecrets()),
      headers: { "x-atlas-device-token": `atlasdt1.${"T".repeat(22)}.${"s".repeat(43)}` },
    });
    expect(answer.statusCode).toBe(403);
    expect(errorOf(answer).code).toBe("forbidden_for_credential");
    expect(answer.cookies ?? []).toEqual([]);
  });
});

describe("the return of the console (§4.2; T16 to T18)", () => {
  it("loopback: no session cookie, a code to the literal 127.0.0.1 and the console's state", async () => {
    const api = setup();
    const { done, secrets } = await consoleReturn(api);
    expect(done.statusCode).toBe(302);
    const location = new URL(done.headers.location as string);
    expect(`${location.protocol}//${location.host}${location.pathname}`).toBe(
      `http://127.0.0.1:${PORT}/callback`,
    );
    expect(location.searchParams.get("state")).toBe(secrets.state);
    const cookies = setCookies(done);
    expect(cookies.has("__Host-atlas_session")).toBe(false);
    expect(cookies.get("__Host-atlas_login")).toBe("");
    expect(done.headers["referrer-policy"]).toBe("no-referrer");
    // The code is signed with the subkey of its purpose, and no other opens it (B3).
    const signer = Signer.fromSessionKey(SESSION_KEY);
    const code = codeOfLoopback(done.headers.location as string);
    expect(JSON.parse(signer.open("console_code", code) as string)).toMatchObject({
      typ: "atlas.console_code",
      cc: secrets.challenge,
      dn: "portátil de casa",
    });
    expect(signer.open("session", code)).toBeUndefined();
    expect(signer.open("login", code)).toBeUndefined();
  });

  it("manual: a page without script, sandboxed, that shows the code only inside the confirmation", async () => {
    const api = setup();
    const { done } = await consoleReturn(api, { mode: "manual" }, consoleSecrets());
    // `port` is still in the query of this helper and is allowed in manual.
    expect(done.statusCode).toBe(200);
    expect(done.headers["content-security-policy"]).toMatch(/; sandbox$/);
    expect(done.headers["content-security-policy"]).not.toContain("allow-same-origin");
    expect(done.headers["cache-control"]).toBe("no-store");
    expect(done.headers["referrer-policy"]).toBe("no-referrer");
    expect(done.body).not.toMatch(/<script|<form|https?:\/\/(?!127)/i);
    const before = done.body.split("<details>")[0] as string;
    const code = codeOfPage(done.body);
    expect(code.length).toBeGreaterThan(100);
    expect(before).not.toContain(code);
    // Found on the screen (captures of E2): a code of ~400 characters with no
    // place to break overflowed a phone five times its width. Nothing on the
    // page may run longer than 64 characters without a break.
    expect(/<code>[^<]{65,}/.test(done.body)).toBe(false);
    expect(done.body).toContain("«portátil de casa»");
    expect(setCookies(done).has("__Host-atlas_session")).toBe(false);
  });
});

describe("POST /api/auth/console/token (§4.3; T20 to T22)", () => {
  it("issues a token once, with its record, its tags and a new console device", async () => {
    const api = setup();
    const { done, secrets } = await consoleReturn(api);
    const code = codeOfLoopback(done.headers.location as string);
    const answer = await exchange(api, code, secrets.verifier);
    expect(answer.statusCode).toBe(200);
    const body = JSON.parse(answer.body);
    expect(body.token).toMatch(/^atlasdt1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    expect(body.token.split(".")[1]).toBe(body.token_id);
    expect(body).toMatchObject({ device_name: "portátil de casa" });
    expect(Date.parse(body.expires_at) - Date.parse(body.issued_at)).toBe(90 * DAY);
    const name = `${TOKENS}${body.token_id}`;
    expect(api.ssm.tags(name)).toEqual({ project: "atlas", env: "dev" });
    const record = JSON.parse(api.ssm.history(name)[0] as string);
    expect(record.email).toBe(ALLOWED.email);
    expect(JSON.stringify(record)).not.toContain(body.token.split(".")[2]);
    expect(JSON.parse(api.s3.text(`sync/devices/${body.device_id}.json`) as string)).toMatchObject({
      type: "console",
      state: "active",
      device_name: "portátil de casa",
    });
    // The single use: the same code again is `console_code_used`, and writes nothing (mutant 19).
    const again = await exchange(api, code, secrets.verifier);
    expect(again.statusCode).toBe(409);
    expect(errorOf(again).code).toBe("console_code_used");
    expect(api.ssm.history(name)).toHaveLength(1);
  });

  it("refuses a code of another purpose, an expired one, the wrong verifier and a pair gone from the list", async () => {
    const api = setup();
    const { done, secrets } = await consoleReturn(api);
    const code = codeOfLoopback(done.headers.location as string);
    const signer = Signer.fromSessionKey(SESSION_KEY);
    const asSession = signer.sign(
      "session",
      JSON.parse(signer.open("console_code", code) as string),
    );
    expect(errorOf(await exchange(api, asSession, secrets.verifier)).code).toBe(
      "console_code_invalid",
    );
    expect(errorOf(await exchange(api, `${code}x`, secrets.verifier)).code).toBe(
      "console_code_invalid",
    );
    expect(errorOf(await exchange(api, code, consoleSecrets().verifier))).toEqual({
      code: "pkce_mismatch",
      details: {},
    });
    api.ssm.set(NAMES.allowList, allowListOf());
    api.advance(121_000);
    expect(errorOf(await exchange(api, code, secrets.verifier)).code).toBe("not_allowed");
    api.advance(300_000);
    expect(errorOf(await exchange(api, code, secrets.verifier)).code).toBe("console_code_expired");
  });

  it("takes the e-mail from the one entry of the sub, and chooses none among two (Q8 (a))", async () => {
    const api = setup();
    const { done, secrets } = await consoleReturn(api);
    api.ssm.set(NAMES.allowList, allowListOf(ALLOWED, { sub: ALLOWED.sub, email: "other@x.test" }));
    api.advance(121_000);
    const answer = await exchange(
      api,
      codeOfLoopback(done.headers.location as string),
      secrets.verifier,
    );
    expect(errorOf(answer)).toEqual({
      code: "not_allowed",
      details: { reason: "ambiguous_subject" },
    });
  });

  it("never takes a device id from the body, and never exchanges with the cookie", async () => {
    const api = setup();
    const { done, secrets } = await consoleReturn(api);
    const answer = await api.call("POST", "/api/auth/console/token", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: codeOfLoopback(done.headers.location as string),
        code_verifier: secrets.verifier,
        device_id: "DDDDDDDDDDDDDDDDDDDDDD",
      }),
      jar: false,
    });
    expect(errorOf(answer)).toEqual({ code: "body_invalid", details: { reason: "fields" } });
    await api.signIn();
    const withCookie = await api.call("POST", "/api/auth/console/token", {
      headers: { "content-type": "application/json", origin: "https://atlas.example" },
      body: "{}",
    });
    expect(errorOf(withCookie).code).toBe("forbidden_for_credential");
  });
});

describe("a token on every request (§2.2; T01 to T10)", () => {
  it("revokes itself, and only itself, and is refused afterwards", async () => {
    const api = setup();
    const first = (await login(api)).body;
    const second = (await login(api)).body;
    const revoked = await withToken(api, "/api/auth/console/revoke", first.token as string);
    expect(revoked.statusCode).toBe(200);
    expect(JSON.parse(revoked.body)).toMatchObject({ token_id: first.token_id });
    expect(
      errorOf(await withToken(api, "/api/auth/console/revoke", first.token as string)).code,
    ).toBe("device_token_revoked");
    expect(
      JSON.parse(api.ssm.history(`${TOKENS}${second.token_id}`).at(-1) as string),
    ).not.toHaveProperty("revoked_at");
  });

  it("checks the format before building any name: a selector never reaches SSM (B1, mutant 13)", async () => {
    const api = setup();
    const { token_id: tokenId, token } = (await login(api)).body as Record<string, string>;
    await withToken(api, "/api/auth/console/revoke", token as string);
    const secret = (token as string).split(".")[2];
    const reads = api.ssm.reads.length;
    for (const forged of [`atlasdt1.${tokenId}:1.${secret}`, `atlasdt1.${tokenId}/x.${secret}`]) {
      const answer = await withToken(api, "/api/auth/console/revoke", forged);
      expect(errorOf(answer)).toEqual({
        code: "device_token_invalid",
        details: { reason: "format" },
      });
    }
    expect(api.ssm.reads.slice(reads)).toEqual([]);
  });

  it("refuses a record whose own token id is another, and a wrong secret", async () => {
    const api = setup();
    const { token_id: tokenId, token } = (await login(api)).body as Record<string, string>;
    const record = JSON.parse(api.ssm.history(`${TOKENS}${tokenId}`)[0] as string);
    const other = "OOOOOOOOOOOOOOOOOOOOOO";
    api.ssm.set(`${TOKENS}${other}`, JSON.stringify(record));
    const secret = (token as string).split(".")[2];
    expect(
      errorOf(await withToken(api, "/api/auth/console/revoke", `atlasdt1.${other}.${secret}`)),
    ).toEqual({
      code: "device_token_invalid",
      details: { reason: "unreadable" },
    });
    const wrong = `atlasdt1.${tokenId}.${"x".repeat(43)}`;
    expect(errorOf(await withToken(api, "/api/auth/console/revoke", wrong))).toEqual({
      code: "device_token_invalid",
      details: { reason: "secret" },
    });
  });

  it("refuses an expired token, also past the ceiling whatever its record says", async () => {
    const api = setup();
    const { token_id: tokenId, token } = (await login(api)).body as Record<string, string>;
    api.advance(90 * DAY);
    expect(errorOf(await withToken(api, "/api/auth/console/revoke", token as string)).code).toBe(
      "device_token_expired",
    );
    const name = `${TOKENS}${tokenId}`;
    const record = JSON.parse(api.ssm.history(name)[0] as string);
    api.ssm.set(name, JSON.stringify({ ...record, expires_at: "2027-12-31T00:00:00Z" }));
    expect((await withToken(api, "/api/auth/console/revoke", token as string)).statusCode).toBe(
      200,
    );
    api.ssm.set(name, JSON.stringify({ ...record, expires_at: "2027-12-31T00:00:00Z" }));
    api.advance(30 * DAY);
    expect(errorOf(await withToken(api, "/api/auth/console/revoke", token as string)).code).toBe(
      "device_token_expired",
    );
  });

  it("refuses a pair gone from the list and a device forgotten, deleted or of another type", async () => {
    for (const change of ["list", "forgotten", "deleted", "web"] as const) {
      const api = setup();
      const { token, device_id: deviceId } = (await login(api)).body as Record<string, string>;
      const key = `sync/devices/${deviceId}.json`;
      if (change === "list") {
        api.ssm.set(NAMES.allowList, allowListOf());
        api.advance(121_000);
      } else if (change === "deleted") {
        api.s3.deleteOutOfBand(key);
      } else {
        const device = JSON.parse(api.s3.text(key) as string);
        api.s3.seed(
          key,
          change === "web"
            ? serializeDeviceObject({
                ...newDevice({
                  deviceId: deviceId as string,
                  type: "web",
                  createdAt: device.created_at,
                }),
              })
            : serializeDeviceObject({
                ...device,
                state: "forgotten",
                forgotten_at: device.created_at,
              }),
        );
      }
      const answer = await withToken(api, "/api/auth/console/revoke", token as string);
      expect(errorOf(answer)).toEqual(
        change === "list"
          ? { code: "not_allowed", details: {} }
          : {
              code: "device_forgotten",
              details: {
                reason: { forgotten: "forgotten", deleted: "missing", web: "wrong_type" }[change],
              },
            },
      );
    }
  });

  it("answers a throttled SSM as remote_unavailable, and reads again next time (B2, mutants 14 and 27)", async () => {
    const api = setup();
    const { token } = (await login(api)).body as Record<string, string>;
    api.ssm.throttleNext();
    const throttled = await withToken(api, "/api/auth/console/revoke", token as string);
    expect(throttled.statusCode).toBe(503);
    expect(errorOf(throttled)).toEqual({
      code: "remote_unavailable",
      details: { dependency: "ssm" },
    });
    expect((await withToken(api, "/api/auth/console/revoke", token as string)).statusCode).toBe(
      200,
    );
  });
});

describe("the renewal (§4.3; T22, mutant 18)", () => {
  it("keeps the device and revokes the previous token before creating the new one", async () => {
    const api = setup();
    const first = (await login(api)).body;
    api.advance(100 * DAY);
    const renewed = await login(api, {}, { "x-atlas-device-token": first.token as string });
    expect(renewed.answer.statusCode).toBe(200);
    expect(renewed.body.device_id).toBe(first.device_id);
    const previous = `putNew ${TOKENS}${first.token_id}`;
    const writes = api.ssm.writes.filter((write) => write !== previous);
    expect(writes).toEqual([
      `overwrite ${TOKENS}${first.token_id}`,
      `putNew ${TOKENS}${renewed.body.token_id}`,
    ]);
  });

  it("leaves no token when cut between the two steps: the previous one revoked, no new one", async () => {
    const api = setup();
    const first = (await login(api)).body;
    const { done, secrets } = await consoleReturn(api);
    api.ssm.collideNext();
    const cut = await exchange(
      api,
      codeOfLoopback(done.headers.location as string),
      secrets.verifier,
      {
        "x-atlas-device-token": first.token as string,
      },
    );
    expect(cut.statusCode).toBe(503);
    expect(
      JSON.parse(api.ssm.history(`${TOKENS}${first.token_id}`).at(-1) as string),
    ).toHaveProperty("revoked_at");
  });

  it("never renews with a revoked token", async () => {
    const api = setup();
    const first = (await login(api)).body;
    await withToken(api, "/api/auth/console/revoke", first.token as string);
    const renewed = await login(api, {}, { "x-atlas-device-token": first.token as string });
    expect(errorOf(renewed.answer).code).toBe("device_token_revoked");
  });
});

describe("the reissue (§4.2 and §4.3; T23, mutant 29 sexies)", () => {
  const seedConsole = (api: Api, id: string, overrides: Record<string, unknown> = {}) =>
    api.s3.seed(
      `sync/devices/${id}.json`,
      serializeDeviceObject({
        ...newDevice({
          deviceId: id,
          type: "console",
          createdAt: "2026-09-01T10:00:00Z",
          deviceName: "sobremesa",
        }),
        pending: 3,
        published_at: "2026-09-20T08:30:00Z",
        ...overrides,
      } as never),
    );
  const ID = "RRRRRRRRRRRRRRRRRRRRRR";

  it("asks for confirmation with the data of the server, and gives no code without it", async () => {
    const api = setup();
    seedConsole(api, ID);
    const { done } = await consoleReturn(api, { reissue_device_id: ID });
    expect(done.statusCode).toBe(200);
    expect(done.headers["content-security-policy"]).toMatch(/sandbox$/);
    expect(done.body).toContain("sobremesa");
    expect(done.body).toContain("2026-09-20 08:30 UTC");
    expect(done.body).toContain("Líneas pendientes que publicó: 3");
    // Loopback: the code only behind the link of the confirmation.
    expect(done.body).toMatch(
      /<a href="http:\/\/127\.0\.0\.1:49152\/callback\?code=[^"]+&amp;state=/,
    );
    const manual = await consoleReturn(api, { reissue_device_id: ID, mode: "manual" });
    const before = manual.done.body.split("<details>")[0] as string;
    expect(before).not.toContain(codeOfPage(manual.done.body));
  });

  it("escapes the name the server keeps, whatever it holds (mutant 29)", async () => {
    const api = setup();
    seedConsole(api, ID, { device_name: '<img src=x onerror="alert(1)">' });
    const { done } = await consoleReturn(api, { reissue_device_id: ID, mode: "manual" });
    expect(done.body).not.toContain("<img");
    expect(done.body).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("refuses a device that is missing, forgotten, of the web or unreadable, each with its code", async () => {
    const api = setup();
    const cases: [string, () => void, string][] = [
      ["MMMMMMMMMMMMMMMMMMMMMM", () => undefined, "reissue_device_missing"],
      [
        ID,
        () => seedConsole(api, ID, { state: "forgotten", forgotten_at: "2026-09-21T00:00:00Z" }),
        "reissue_device_forgotten",
      ],
      [
        "WWWWWWWWWWWWWWWWWWWWWW",
        () =>
          api.s3.seed(
            "sync/devices/WWWWWWWWWWWWWWWWWWWWWW.json",
            serializeDeviceObject(
              newDevice({
                deviceId: "WWWWWWWWWWWWWWWWWWWWWW",
                type: "web",
                createdAt: "2026-09-01T10:00:00Z",
              }),
            ),
          ),
        "reissue_device_not_console",
      ],
      [
        "UUUUUUUUUUUUUUUUUUUUUU",
        () => api.s3.seed("sync/devices/UUUUUUUUUUUUUUUUUUUUUU.json", "{"),
        "reissue_device_unreadable",
      ],
    ];
    for (const [id, seed, code] of cases) {
      seed();
      const { done } = await consoleReturn(api, { reissue_device_id: id });
      expect(done.statusCode).toBe(403);
      expect(done.body).toContain(code);
      expect(done.headers.location).toBeUndefined();
    }
  });

  it("revokes every live token of the device first, keeps its id, and checks it again at the exchange", async () => {
    const api = setup();
    seedConsole(api, ID);
    const record = (tokenId: string) =>
      JSON.stringify({
        token_record_format: 1,
        token_id: tokenId,
        secret_sha256: "a".repeat(64),
        sub: ALLOWED.sub,
        email: ALLOWED.email,
        device_id: ID,
        device_name: "sobremesa",
        issued_at: "2026-09-01T10:00:00Z",
        expires_at: "2026-11-30T10:00:00Z",
      });
    for (const tokenId of ["AAAAAAAAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBBBBBBBB"]) {
      api.ssm.set(`${TOKENS}${tokenId}`, record(tokenId));
    }
    // A live token of **another** console: the reissue of ID never touches it
    // (review of PR #95, B1: revoking every record survived).
    const other = "OTHEROTHEROTHEROTHEROT";
    const otherRecord = record(other).replace(
      `"device_id":"${ID}"`,
      '"device_id":"DDDDDDDDDDDDDDDDDDDDDD"',
    );
    api.ssm.set(`${TOKENS}${other}`, otherRecord);
    const { done, secrets } = await consoleReturn(api, { reissue_device_id: ID });
    const link = /<a href="([^"]+)"/.exec(done.body)?.[1]?.replaceAll("&amp;", "&") as string;
    const answer = await exchange(api, codeOfLoopback(link), secrets.verifier);
    expect(answer.statusCode).toBe(200);
    const body = JSON.parse(answer.body);
    expect(body.device_id).toBe(ID);
    for (const tokenId of ["AAAAAAAAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBBBBBBBB"]) {
      expect(JSON.parse(api.ssm.history(`${TOKENS}${tokenId}`).at(-1) as string)).toHaveProperty(
        "revoked_at",
      );
    }
    expect(api.ssm.history(`${TOKENS}${other}`)).toEqual([otherRecord]);
    expect(api.ssm.writes.some((write) => write.endsWith(other))).toBe(false);
    const writes = api.ssm.writes.filter(
      (write) => !write.startsWith("putNew /atlas/dev/device-tokens/AAAA"),
    );
    expect(writes.at(-1)).toBe(`putNew ${TOKENS}${body.token_id}`);
    // The record keeps the name of the device the user confirmed, the one of
    // its object, not the one the console proposed (review of PR #95, N7).
    expect(body.device_name).toBe("sobremesa");
    expect(JSON.parse(api.ssm.history(`${TOKENS}${body.token_id}`)[0] as string).device_name).toBe(
      "sobremesa",
    );
    // Forgotten between the return and the exchange: refused at the exchange too.
    const later = await consoleReturn(api, { reissue_device_id: ID });
    const code = codeOfLoopback(
      /<a href="([^"]+)"/.exec(later.done.body)?.[1]?.replaceAll("&amp;", "&") as string,
    );
    seedConsole(api, ID, { state: "forgotten", forgotten_at: "2026-10-01T00:00:00Z" });
    expect(errorOf(await exchange(api, code, later.secrets.verifier)).code).toBe(
      "reissue_device_forgotten",
    );
  });
});

describe("the exchange sent again, and the rules no test tied (review of PR #95)", () => {
  const reissueCode = async (api: Api, id: string) => {
    const { done, secrets } = await consoleReturn(api, { reissue_device_id: id });
    const link = /<a href="([^"]+)"/.exec(done.body)?.[1]?.replaceAll("&amp;", "&") as string;
    return { code: codeOfLoopback(link), verifier: secrets.verifier };
  };
  const newRecordName = (api: Api): string =>
    api.ssm.writes
      .filter((write) => write.startsWith("putNew "))
      .map((write) => write.slice("putNew ".length))
      .at(-1) as string;

  it("answers a code sent again with 409 and writes nothing: issue, renewal and reissue (N1)", async () => {
    const api = setup();
    // Issue.
    const { done, secrets } = await consoleReturn(api);
    const code = codeOfLoopback(done.headers.location as string);
    const first = JSON.parse((await exchange(api, code, secrets.verifier)).body);
    let writes = api.ssm.writes.length;
    expect(errorOf(await exchange(api, code, secrets.verifier)).code).toBe("console_code_used");
    expect(api.ssm.writes.length).toBe(writes);
    // Renewal: the code sent again, with the token it just handed out.
    const renewal = await consoleReturn(api);
    const renewalCode = codeOfLoopback(renewal.done.headers.location as string);
    const second = JSON.parse(
      (
        await exchange(api, renewalCode, renewal.secrets.verifier, {
          "x-atlas-device-token": first.token,
        })
      ).body,
    );
    writes = api.ssm.writes.length;
    const again = await exchange(api, renewalCode, renewal.secrets.verifier, {
      "x-atlas-device-token": second.token,
    });
    expect(errorOf(again).code).toBe("console_code_used");
    expect(api.ssm.writes.length).toBe(writes);
    // Reissue: the code sent again does not revoke the token just handed out.
    const reissue = await reissueCode(api, first.device_id as string);
    const third = JSON.parse((await exchange(api, reissue.code, reissue.verifier)).body);
    writes = api.ssm.writes.length;
    expect(errorOf(await exchange(api, reissue.code, reissue.verifier)).code).toBe(
      "console_code_used",
    );
    expect(api.ssm.writes.length).toBe(writes);
    expect(
      JSON.parse(api.ssm.history(`${TOKENS}${third.token_id}`).at(-1) as string),
    ).not.toHaveProperty("revoked_at");
  });

  it("refuses to renew with the token of another sub, writing nothing (B2, other_subject)", async () => {
    const api = setup();
    api.ssm.set(NAMES.allowList, allowListOf(ALLOWED, STRANGER));
    const mine = (await login(api)).body;
    const theirs = await consoleReturn(api, {}, consoleSecrets(), STRANGER);
    const writes = api.ssm.writes.length;
    const answer = await exchange(
      api,
      codeOfLoopback(theirs.done.headers.location as string),
      theirs.secrets.verifier,
      { "x-atlas-device-token": mine.token as string },
    );
    expect(answer.statusCode).toBe(403);
    expect(errorOf(answer)).toEqual({ code: "not_allowed", details: { reason: "other_subject" } });
    expect(api.ssm.writes.length).toBe(writes);
  });

  it("refuses to renew and reissue at once, writing nothing (renewal_and_reissue)", async () => {
    const api = setup();
    const mine = (await login(api)).body;
    const reissue = await reissueCode(api, mine.device_id as string);
    const writes = api.ssm.writes.length;
    const answer = await exchange(api, reissue.code, reissue.verifier, {
      "x-atlas-device-token": mine.token as string,
    });
    expect(errorOf(answer)).toEqual({
      code: "body_invalid",
      details: { reason: "renewal_and_reissue" },
    });
    expect(api.ssm.writes.length).toBe(writes);
  });

  it("revokes the new token and answers 503 when the device cannot be created (N3)", async () => {
    const api = setup();
    const { done, secrets } = await consoleReturn(api);
    api.s3.failNext();
    const answer = await exchange(
      api,
      codeOfLoopback(done.headers.location as string),
      secrets.verifier,
    );
    expect(answer.statusCode).toBe(503);
    expect(errorOf(answer)).toEqual({ code: "remote_unavailable", details: { dependency: "s3" } });
    expect(answer.body).not.toContain("atlasdt1");
    expect(JSON.parse(api.ssm.history(newRecordName(api)).at(-1) as string)).toHaveProperty(
      "revoked_at",
    );
  });

  it("tries the revocation again when SSM fails, and still answers for S3 (N3, retry)", async () => {
    for (const failures of [2, 3]) {
      const api = setup();
      const { done, secrets } = await consoleReturn(api);
      const overwrite = api.ssm.overwrite.bind(api.ssm);
      let left = failures;
      api.ssm.overwrite = async (name: string, value: string) => {
        if (left > 0) {
          left -= 1;
          throw new Error("ssm down");
        }
        return overwrite(name, value);
      };
      api.s3.failNext();
      const answer = await exchange(
        api,
        codeOfLoopback(done.headers.location as string),
        secrets.verifier,
      );
      expect(errorOf(answer)).toEqual({
        code: "remote_unavailable",
        details: { dependency: "s3" },
      });
      expect(answer.body).not.toContain("atlasdt1");
      const last = JSON.parse(api.ssm.history(newRecordName(api)).at(-1) as string);
      // Two failures and the third try revokes it; three and it stays as it was.
      expect("revoked_at" in last).toBe(failures === 2);
    }
  });

  it("revokes the new token and hands nothing out when the new device id is taken (collision)", async () => {
    const api = setup({ random: (bytes) => new Uint8Array(bytes).fill(9) });
    const taken = Buffer.alloc(16, 9).toString("base64url");
    api.s3.seed(
      `sync/devices/${taken}.json`,
      serializeDeviceObject(
        newDevice({ deviceId: taken, type: "web", createdAt: "2026-09-01T10:00:00Z" }),
      ),
    );
    const { done, secrets } = await consoleReturn(api);
    const answer = await exchange(
      api,
      codeOfLoopback(done.headers.location as string),
      secrets.verifier,
    );
    expect(answer.statusCode).toBe(500);
    expect(answer.body).not.toContain("atlasdt1");
    expect(JSON.parse(api.ssm.history(newRecordName(api)).at(-1) as string)).toHaveProperty(
      "revoked_at",
    );
  });

  it("says a record that cannot be read apart from one that does not exist (token_unreadable)", async () => {
    const api = setup();
    const id = "UUUUUUUUUUUUUUUUUUUUUU";
    api.ssm.set(`${TOKENS}${id}`, "{");
    await api.signIn();
    const writes = api.ssm.writes.length;
    const answer = await api.call("POST", `/api/devices/tokens/${id}/revoke`, {
      headers: { "content-type": "application/json", origin: "https://atlas.example" },
      body: "{}",
    });
    expect(errorOf(answer)).toEqual({ code: "not_found", details: { reason: "token_unreadable" } });
    expect(api.ssm.writes.length).toBe(writes);
  });
});

describe("the list and the revocation of the web (§4.5; T25)", () => {
  it("lists with the session only: status, last sync, recent, and no e-mail nor sub", async () => {
    const api = setup();
    const {
      token,
      device_id: deviceId,
      token_id: tokenId,
    } = (await login(api)).body as Record<string, string>;
    const key = `sync/devices/${deviceId}.json`;
    api.s3.seed(
      key,
      serializeDeviceObject({
        ...JSON.parse(api.s3.text(key) as string),
        last_sync_at: "2026-10-01T11:00:00Z",
      }),
    );
    api.ssm.set(`${TOKENS}broken`, "{");
    expect(errorOf(await withToken(api, "/api/devices/tokens", token as string, "GET")).code).toBe(
      "forbidden_for_credential",
    );
    await api.signIn();
    const listed = await api.call("GET", "/api/devices/tokens");
    expect(listed.statusCode).toBe(200);
    const { tokens } = JSON.parse(listed.body);
    expect(tokens).toEqual([
      {
        token_id: tokenId,
        device_id: deviceId,
        device_name: "portátil de casa",
        issued_at: "2026-10-01T10:00:00Z",
        expires_at: "2026-12-30T10:00:00Z",
        status: "active",
        last_sync_at: "2026-10-01T11:00:00Z",
        recent: true,
      },
      { token_id: "broken", status: "unreadable" },
    ]);
    expect(listed.body).not.toContain(ALLOWED.email);
    expect(listed.body).not.toContain(ALLOWED.sub);
    expect(api.logs.at(-1)).toContain('"reason":"token_record_unreadable"');
  });

  it("revokes any token with the session, the id checked before any name, once", async () => {
    const api = setup();
    const { token_id: tokenId } = (await login(api)).body as Record<string, string>;
    await api.signIn();
    const post = (id: string) =>
      api.call("POST", `/api/devices/tokens/${id}/revoke`, {
        headers: { "content-type": "application/json", origin: "https://atlas.example" },
        body: "{}",
      });
    const reads = api.ssm.reads.length;
    expect(errorOf(await post(`${tokenId}:1`))).toEqual({
      code: "body_invalid",
      details: { reason: "token_id" },
    });
    expect(api.ssm.reads.slice(reads).some((read) => read.includes(":1"))).toBe(false);
    const once = await post(tokenId as string);
    const twice = await post(tokenId as string);
    expect(JSON.parse(twice.body).revoked_at).toBe(JSON.parse(once.body).revoked_at);
    expect(api.ssm.writes.filter((write) => write.startsWith("overwrite"))).toHaveLength(1);
    expect(errorOf(await post("MMMMMMMMMMMMMMMMMMMMMM"))).toEqual({
      code: "not_found",
      details: { reason: "token_missing" },
    });
  });
});

describe("the log of the console flow (mutant 9)", () => {
  it("never holds the token, its secret, the code or the e-mail; at most the token id", async () => {
    const api = setup();
    const { done, secrets } = await consoleReturn(api);
    const code = codeOfLoopback(done.headers.location as string);
    const answer = await exchange(api, code, secrets.verifier);
    const body = JSON.parse(answer.body);
    await withToken(api, "/api/auth/console/revoke", body.token);
    const logs = api.logs.join("\n");
    for (const secret of [
      body.token,
      body.token.split(".")[2],
      code,
      secrets.verifier,
      ALLOWED.email,
      ALLOWED.sub,
    ]) {
      expect(logs).not.toContain(secret);
    }
    expect(logs).toContain(`"token_id":"${body.token_id}"`);
  });
});
