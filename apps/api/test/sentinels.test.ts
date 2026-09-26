// Feature 015, E1: nothing secret or personal ever reaches a log (§2 bis; R25;
// N3). Every route is walked with recognisable values — an e-mail, a `sub`, a
// secret of the client, the session key, a device token, a line with an
// amount, bodies that **start** with the sentinel — and `stdout`, `stderr`,
// `console` and the logger itself are captured: none may carry any of them,
// nor the cookies, the session id, the code or the verifier of an attempt.

import { createHash, randomBytes } from "node:crypto";
import { base64url, pkceChallenge, Signer } from "@atlas/adapters/access";
import { SdkObjectStore } from "@atlas/adapters/aws-sdk";
import { newDevice, serializeDeviceObject } from "@atlas/domain/access";
import { S3ServiceException } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowListOf, consoleLogin, NAMES, SELF, setup } from "./harness.js";

const SUB = "SENTINELSUB7777777777";
const EMAIL = "sentinel.email@example.test";
const CLIENT_SECRET = "SENTINEL-CLIENT-SECRET";
const TOKEN = `atlasdt1.${"S".repeat(22)}.${"E".repeat(43)}`;
const LINE =
  '{"schema_version":1,"type":"buy","amount":"987654.32","account_id":"SENTINEL-ACCOUNT"}';

describe("the log of the API (R25)", () => {
  const captured: string[] = [];
  beforeEach(() => {
    captured.length = 0;
    const grab = (chunk: unknown): boolean => {
      captured.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, "write").mockImplementation(grab as typeof process.stdout.write);
    vi.spyOn(process.stderr, "write").mockImplementation(grab as typeof process.stderr.write);
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        captured.push(args.map(String).join(" "));
      });
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("carries none of them, on any route, in any outcome", async () => {
    const api = setup();
    const sessionKey = base64url(Buffer.from("SENTINEL-SESSION-KEY-32-BYTES!!!"));
    api.ssm.set(NAMES.sessionKey, sessionKey);
    api.ssm.set(NAMES.clientSecret, CLIENT_SECRET);
    api.ssm.set(NAMES.allowList, allowListOf({ sub: SUB, email: EMAIL }));
    (api.google as unknown as { clientSecret: string }).clientSecret = CLIENT_SECRET;
    const account = { sub: SUB, email: EMAIL };

    const { start, back } = await api.signIn(account);
    const attempt = (start.cookies ?? []).join(" ");
    const location = new URL(start.headers.location as string);
    await api.call("GET", "/api/session");
    await api.call("GET", "/api/session", { headers: { "x-atlas-device-token": TOKEN } });
    await api.call("GET", "/api/session", {
      jar: false,
      headers: { "x-atlas-device-token": TOKEN },
    });
    for (const body of [
      `SECRET-CODE ${TOKEN}`,
      `${LINE}`,
      `{"lines":[{"line":${JSON.stringify(LINE)}}]`,
      `SENTINEL${EMAIL}`,
    ]) {
      await api.call("POST", "/api/auth/logout", {
        headers: { "content-type": "application/json", origin: SELF },
        body,
      });
      await api.call("POST", "/api/auth/logout", {
        headers: { "content-type": "text/plain", origin: SELF },
        body,
      });
    }
    await api.call("POST", "/api/ledger/lines", {
      headers: { "content-type": "application/json" },
      body: LINE,
    });
    await api.call("GET", `/api/${EMAIL}`, { rawQuery: `sub=${SUB}&token=${TOKEN}` });
    await api.call("GET", "/api/auth/callback", {
      query: { code: back.code, state: `${SUB}xxxxxxxxxxxxxxxxxxxxxxx` },
    });
    await api.signIn({ sub: `${SUB}0`, email: EMAIL });
    api.google.nextClaims = { email_verified: false };
    await api.signIn(account);
    api.ssm.throttleNext();
    await api.call("GET", "/api/session");
    await api.call("POST", "/api/auth/logout", {
      headers: { "content-type": "application/json", origin: SELF },
      body: "{}",
    });

    const session = Signer.fromSessionKey(sessionKey);
    expect(session).toBeDefined();
    // The failures too (S5 of the review of PR #90): the provider down, a
    // forged token that carries the sentinels, S3 failing, and an unexpected
    // error whose message carries them.
    await api.signIn(account);
    api.google.down = true;
    await api.signIn(account);
    api.google.down = false;
    const forged = api.google.token(
      { alg: "RS256", kid: "unknown-kid" },
      { sub: SUB, email: EMAIL },
    );
    const exchange = api.google.exchangeCode.bind(api.google);
    api.google.exchangeCode = async () => forged;
    await api.signIn(account);
    api.google.exchangeCode = async () =>
      `${forged.split(".")[0]}.${Buffer.from(EMAIL).toString("base64url")}.x`;
    await api.signIn(account);
    api.google.exchangeCode = exchange;
    await api.signIn(account);
    api.s3.failNext();
    await api.call("GET", "/api/session");
    api.s3.failNext();
    await api.signIn(account);
    const failing = setup({
      objects: {
        get: async () => {
          throw new Error(`boom ${SUB} ${EMAIL} ${TOKEN} ${LINE}`);
        },
        putIfNoneMatch: async () => {
          throw new Error(`boom ${SUB} ${EMAIL}`);
        },
        putIfMatch: async () => "written",
        list: async () => [],
      },
    });
    failing.ssm.set(NAMES.allowList, allowListOf({ sub: SUB, email: EMAIL }));
    await failing.signIn(account);
    await failing.call("GET", "/api/session", {
      cookies: [`__Host-atlas_session=${api.session()}`],
    });
    expect(failing.logs.some((line) => line.includes('"status":500'))).toBe(true);
    expect(api.logs.some((line) => line.includes("google_exchange_failed"))).toBe(true);
    expect(api.logs.some((line) => line.includes("id_token_invalid"))).toBe(true);
    expect(api.logs.some((line) => line.includes('"dependency":"s3"'))).toBe(true);

    const everything = [...api.logs, ...failing.logs, ...captured].join("\n");
    expect(api.logs.length).toBeGreaterThan(15);
    const secrets = [
      SUB,
      EMAIL,
      CLIENT_SECRET,
      sessionKey,
      TOKEN,
      "SECRET",
      "SENTINEL",
      "987654",
      back.code,
      location.searchParams.get("state") as string,
      location.searchParams.get("nonce") as string,
      location.searchParams.get("code_challenge") as string,
      ...attempt.split(/[=; ]/).filter((piece) => piece.length > 30),
    ];
    for (const secret of secrets) {
      expect(everything).not.toContain(secret);
    }
    for (const line of [...api.logs, ...failing.logs]) {
      const entry = JSON.parse(line) as Record<string, unknown>;
      expect(
        Object.keys(entry).every((key) =>
          [
            "level",
            "request_id",
            "method",
            "route",
            "status",
            "code",
            "reason",
            "dependency",
            "token_id",
          ].includes(key),
        ),
      ).toBe(true);
      expect(typeof entry.request_id).toBe("string");
    }
  });

  /**
   * The five routes of the console (review of PR #95, B1): the start, the
   * return by loopback, by hand and to reissue, the exchange — issue, renewal,
   * reissue, sent again, forged, malformed, with SSM and S3 failing —, the
   * revocation of the own token and the list and revocation of the web. A
   * record is sown whose `sub`, `email` and `secret_sha256` are sentinels, and
   * the hashes of the real tokens are looked for too: at most a `token_id`.
   */
  it("carries none of them on the routes of the console, in any outcome", async () => {
    const api = setup();
    api.ssm.set(NAMES.allowList, allowListOf({ sub: SUB, email: EMAIL }));
    const account = { sub: SUB, email: EMAIL };
    const HASH = "5e".repeat(32);
    const SOWN = "SOWNSOWNSOWNSOWNSOWNSO";
    const sownDevice = "SOWNDEVICESOWNDEVICESO";
    api.ssm.set(
      `/atlas/dev/device-tokens/${SOWN}`,
      JSON.stringify({
        token_record_format: 1,
        token_id: SOWN,
        secret_sha256: HASH,
        sub: SUB,
        email: EMAIL,
        device_id: sownDevice,
        device_name: "sembrado",
        issued_at: "2026-09-30T10:00:00Z",
        expires_at: "2026-12-29T10:00:00Z",
      }),
    );
    api.s3.seed(
      `sync/devices/${sownDevice}.json`,
      serializeDeviceObject(
        newDevice({
          deviceId: sownDevice,
          type: "console",
          createdAt: "2026-09-30T10:00:00Z",
          deviceName: "sembrado",
        }),
      ),
    );
    api.ssm.set("/atlas/dev/device-tokens/UNREADABLEUNREADABLE00", `{"sub":"${SUB}"`);
    const forged = `atlasdt1.${SOWN}.${"E".repeat(43)}`;
    const seen: string[] = [];

    const walk = async (extra: Record<string, string> = {}) => {
      const verifier = base64url(randomBytes(32));
      const state = base64url(randomBytes(32));
      seen.push(verifier, state);
      const start = await api.call("GET", "/api/auth/console/start", {
        query: {
          port: "49152",
          state,
          code_challenge: pkceChallenge(verifier),
          code_challenge_method: "S256",
          device_name: "SENTINEL device",
          ...extra,
        },
      });
      const back = api.google.authorize(start.headers.location as string, account);
      seen.push(back.code);
      const done = await api.call("GET", "/api/auth/callback", {
        query: { code: back.code, state: back.state },
      });
      const target =
        done.headers.location ??
        /<a href="([^"]+)"/.exec(done.body)?.[1]?.replaceAll("&amp;", "&") ??
        `http://x/?code=${/<\/summary>[\s\S]*<code>([\s\S]+?)<\/code>/.exec(done.body)?.[1]?.replaceAll("<wbr>", "")}`;
      const code = new URL(target, "http://x").searchParams.get("code") ?? "";
      seen.push(code);
      return { code, verifier };
    };
    const post = (path: string, body: string, headers: Record<string, string> = {}) =>
      api.call("POST", path, {
        headers: { "content-type": "application/json", ...headers },
        body,
        jar: false,
      });
    const exchange = (code: string, verifier: string, token?: string) =>
      post(
        "/api/auth/console/token",
        JSON.stringify({ code, code_verifier: verifier }),
        token === undefined ? {} : { "x-atlas-device-token": token },
      );

    // Issue, and the same code again.
    const first = await walk();
    const issued = JSON.parse((await exchange(first.code, first.verifier)).body);
    await exchange(first.code, first.verifier);
    // Renewal with the token just issued, and a renewal with the sown record
    // (its hash is a sentinel: the secret does not match).
    const renewal = await walk();
    const renewed = JSON.parse((await exchange(renewal.code, renewal.verifier, issued.token)).body);
    const withSown = await walk();
    await exchange(withSown.code, withSown.verifier, forged);
    // Reissue: the confirmation page, the exchange, and a device refused.
    const reissue = await walk({ reissue_device_id: sownDevice });
    const reissued = JSON.parse((await exchange(reissue.code, reissue.verifier)).body);
    await walk({ reissue_device_id: "MISSINGMISSINGMISSING0" });
    // Manual mode.
    await walk({ mode: "manual" });
    // Forged and malformed codes and bodies that start with a sentinel.
    await exchange(`SENTINEL${EMAIL}.${"x".repeat(43)}`, first.verifier);
    await post("/api/auth/console/token", `SECRET-CODE ${SUB} ${EMAIL}`);
    await post("/api/auth/console/token", `{"code":"${SUB}","code_verifier":"${EMAIL}"}`);
    await api.call("GET", "/api/auth/console/start", {
      rawQuery: `device_name=${EMAIL}&sub=${SUB}`,
    });
    // SSM and S3 failing inside the exchange.
    const throttled = await walk();
    api.ssm.throttleNext();
    await exchange(throttled.code, throttled.verifier);
    const s3down = await walk();
    api.s3.failNext();
    await exchange(s3down.code, s3down.verifier);
    // The own revocation: the real token, the forged one, one malformed.
    await post("/api/auth/console/revoke", "{}", { "x-atlas-device-token": renewed.token });
    await post("/api/auth/console/revoke", "{}", { "x-atlas-device-token": forged });
    await post("/api/auth/console/revoke", "{}", { "x-atlas-device-token": `${forged}:1` });
    api.ssm.throttleNext();
    await post("/api/auth/console/revoke", "{}", { "x-atlas-device-token": reissued.token });
    // The list and the revocation of the web, with the session.
    await api.signIn(account);
    await api.call("GET", "/api/devices/tokens");
    for (const id of [SOWN, "UNREADABLEUNREADABLE00", `${SUB}`, "MISSINGMISSINGMISSING0"]) {
      await api.call("POST", `/api/devices/tokens/${id}/revoke`, {
        headers: { "content-type": "application/json", origin: SELF },
        body: "{}",
      });
    }
    api.ssm.throttleNext();
    await api.call("GET", "/api/devices/tokens");

    const hashes = api.ssm.writes
      .filter((write) => write.startsWith("putNew "))
      .flatMap((write) => api.ssm.history(write.slice("putNew ".length)))
      .map((value) => (JSON.parse(value) as { secret_sha256: string }).secret_sha256);
    expect(hashes.length).toBeGreaterThan(3);
    const tokens = [issued.token, renewed.token, reissued.token].map(String);
    const secrets = [
      SUB,
      EMAIL,
      HASH,
      "SENTINEL",
      "SECRET",
      ...hashes,
      ...tokens,
      ...tokens.map((token) => token.split(".")[2] as string),
      ...tokens.map((token) =>
        createHash("sha256")
          .update(token.split(".")[2] as string)
          .digest("hex"),
      ),
      ...seen.filter((value) => value.length > 20),
    ];
    const everything = [...api.logs, ...captured].join("\n");
    for (const secret of secrets) {
      expect(everything).not.toContain(secret);
    }
    // Every route was walked, the failures included.
    for (const route of [
      "/api/auth/console/start",
      "/api/auth/console/token",
      "/api/auth/console/revoke",
      "/api/devices/tokens",
      "/api/devices/tokens/{token_id}/revoke",
    ]) {
      expect(api.logs.some((line) => line.includes(`"route":"${route}"`))).toBe(true);
    }
    for (const code of [
      "console_code_used",
      "token_renewed",
      "token_reissued",
      "remote_unavailable",
    ]) {
      expect(api.logs.some((line) => line.includes(code))).toBe(true);
    }
  });
  it("carries none of them on the routes of the sync and of the reference data (E3)", async () => {
    const api = setup();
    api.ssm.set(NAMES.allowList, allowListOf({ sub: SUB, email: EMAIL }));
    const account = { sub: SUB, email: EMAIL };
    const console_ = await consoleLogin(api, account);
    await api.signIn(account);
    const LEDGER_LINE = JSON.stringify({
      schema_version: 1,
      id: "01ARYZ6S41TSV4RRFFQ69G5FA0",
      recorded_at: "2026-09-01T18:22:05.000Z",
      type: "account_created",
      account_id: "SENTINEL-ACCOUNT",
      name: "SENTINEL-NAME 987654.32",
      platform: "test",
      book: "core",
      base_currency: "EUR",
      country: "ES",
      active: true,
    });
    const token = { "x-atlas-device-token": console_.token };
    const json = { "content-type": "application/json" };
    const cookie = { origin: SELF, ...json };
    // Initialise with the sentinel line, read it back, append good and bad lines.
    const empty = createHash("sha256").update("").digest("hex");
    await api.call("PUT", "/api/ledger", {
      headers: { ...token, ...json, "if-match": `"${empty}"` },
      body: JSON.stringify({ content: `${LINE}\n`, confirm_duplicate_ids: [] }),
      jar: false,
    });
    await api.call("PUT", "/api/ledger", {
      headers: { ...token, ...json, "if-match": `"${empty}"` },
      body: JSON.stringify({ content: `${LEDGER_LINE}\n`, confirm_duplicate_ids: [] }),
      jar: false,
    });
    const read = await api.call("GET", "/api/ledger", { headers: token, jar: false });
    await api.call("GET", "/api/ledger");
    for (const body of [
      JSON.stringify({ lines: [{ line: LINE }] }),
      JSON.stringify({ lines: [{ line: LEDGER_LINE }] }),
      `SENTINEL-ACCOUNT ${LINE}`,
      JSON.stringify({ lines: [{ line: LINE }], device_id: "SENTINEL-DEVICE-IN-BODY" }),
    ]) {
      await api.call("POST", "/api/ledger/lines", {
        headers: { ...cookie, "if-match": read.headers.etag as string },
        body,
      });
      await api.call("POST", "/api/ledger/lines", {
        headers: { ...token, ...json, "if-match": read.headers.etag as string },
        body,
        jar: false,
      });
    }
    await api.call("PUT", "/api/sync/devices/self", {
      headers: { ...token, ...json },
      body: JSON.stringify({ pending: 1, held: 0, last_sync_at: "SENTINEL-ACCOUNT" }),
      jar: false,
    });
    await api.call("PUT", "/api/sync/devices/self", {
      headers: cookie,
      body: JSON.stringify({ pending: 1, held: 0, last_sync_at: "2026-10-01T09:00:00Z" }),
    });
    await api.call("GET", "/api/sync/devices");
    api.s3.seed("prices/SENTINEL.jsonl", `${LINE}\n`);
    await api.call("GET", "/api/reference/index", { headers: token, jar: false });
    await api.call("GET", "/api/reference/prices/SENTINEL.jsonl", { headers: token, jar: false });
    await api.call("GET", "/api/reference/prices/..SENTINEL-ACCOUNT", {
      headers: token,
      jar: false,
    });
    api.s3.failNext();
    await api.call("GET", "/api/ledger", { headers: token, jar: false });

    const everything = [...api.logs, ...captured].join("\n");
    for (const secret of [
      "987654.32",
      "SENTINEL-ACCOUNT",
      "SENTINEL-NAME",
      "SENTINEL-DEVICE-IN-BODY",
      console_.token,
      console_.token.split(".")[2] as string,
      SUB,
      EMAIL,
    ]) {
      expect(everything).not.toContain(secret);
    }
    for (const route of [
      "/api/ledger",
      "/api/ledger/lines",
      "/api/sync/devices/self",
      "/api/sync/devices",
      "/api/reference/index",
      "/api/reference/prices/{name}",
    ]) {
      expect(
        api.logs.some((line) => line.includes(`"route":"${route}"`)),
        route,
      ).toBe(true);
    }
    for (const code of [
      "initialised",
      "init_rejected",
      "line_rejected",
      "body_not_json",
      "remote_unavailable",
    ]) {
      expect(
        api.logs.some((line) => line.includes(`"${code}"`)),
        code,
      ).toBe(true);
    }
  });
  it("carries nothing of an error of the SDK that is not transient: not the bucket, not the key (review of PR #96, N4)", async () => {
    const first = setup();
    const console_ = await consoleLogin(first);
    const BUCKET = "sentinel-bucket-7777";
    const ARN = "arn:aws:sts::123456789012:assumed-role/atlas-dev-api/SENTINEL";
    const client = {
      send: async (command: { input: { Key?: string } }) => {
        throw new S3ServiceException({
          name: "AccessDenied",
          $fault: "client",
          $metadata: { httpStatusCode: 403 },
          message: `User: ${ARN} is not authorized to perform s3:GetObject on ${BUCKET}/${String(command.input.Key)}`,
        });
      },
    };
    const api = setup({
      objects: new SdkObjectStore(client as never, BUCKET),
      parameters: first.ssm,
    });
    const answer = await api.call("GET", "/api/ledger", {
      headers: { "x-atlas-device-token": console_.token },
      jar: false,
    });
    expect(answer.statusCode).toBe(500);
    expect(answer.body).not.toContain(BUCKET);
    const everything = [...api.logs, ...captured].join("\n");
    for (const secret of [BUCKET, ARN, "123456789012", "sync/devices", console_.token]) {
      expect(everything).not.toContain(secret);
    }
    expect(JSON.parse(api.logs.at(-1) as string)).toMatchObject({
      status: 500,
      code: "internal",
      reason: "AccessDenied",
    });
  });
});
