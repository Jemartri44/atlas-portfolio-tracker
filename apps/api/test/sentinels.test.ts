// Nothing secret or personal ever reaches a log (`docs/specification.md` §11.7). Every route is
// walked with recognisable values — an e-mail, a `sub`, a secret of the client, the session key, a
// line with an amount, bodies that **start** with the sentinel — and `stdout`,
// `stderr`, `console` and the logger itself are captured: none may carry any of them, nor the
// cookies, the session id, the code or the verifier of an attempt.

import { base64url, Signer } from "@atlas/adapters/access";
import { SdkObjectStore } from "@atlas/adapters/aws-sdk";
import { S3ServiceException } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowListOf, NAMES, SELF, setup } from "./harness.js";

const SUB = "SENTINELSUB7777777777";
const EMAIL = "sentinel.email@example.test";
const CLIENT_SECRET = "SENTINEL-CLIENT-SECRET";
/** A secret-looking value sent where nothing expects it. */
const TOKEN = "SENTINEL-BEARER-SSSSSSSSSSSSSSSSSSSSSS";
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
    // The failures too: the provider down, a forged token that carries the sentinels, S3 failing,
    // and an unexpected error whose message carries them.
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
    // Its own session, which the mark of logout-all cannot be read for.
    await failing.call("GET", "/api/session");
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
          ].includes(key),
        ),
      ).toBe(true);
      expect(typeof entry.request_id).toBe("string");
    }
  });

  it("carries none of them on the routes of the sync and of the reference data (E3)", async () => {
    const api = setup();
    api.ssm.set(NAMES.allowList, allowListOf({ sub: SUB, email: EMAIL }));
    const account = { sub: SUB, email: EMAIL };
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
    const json = { "content-type": "application/json" };
    const cookie = { origin: SELF, ...json };
    api.s3.seed("ledger/ledger.jsonl", `${LEDGER_LINE}\n`);
    const read = await api.call("GET", "/api/ledger");
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
    }
    api.s3.seed("prices/SENTINEL.jsonl", `${LINE}\n`);
    await api.call("GET", "/api/reference/index");
    await api.call("GET", "/api/reference/prices/SENTINEL.jsonl");
    await api.call("GET", "/api/reference/prices/..SENTINEL-ACCOUNT");
    api.s3.failNext();
    await api.call("GET", "/api/ledger");
    await api.call("POST", "/api/auth/logout-all", { headers: cookie, body: "{}" });

    const everything = [...api.logs, ...captured].join("\n");
    for (const secret of [
      "987654.32",
      "SENTINEL-ACCOUNT",
      "SENTINEL-NAME",
      "SENTINEL-DEVICE-IN-BODY",
      SUB,
      EMAIL,
    ]) {
      expect(everything).not.toContain(secret);
    }
    for (const route of [
      "/api/ledger",
      "/api/ledger/lines",
      "/api/auth/logout-all",
      "/api/reference/index",
      "/api/reference/prices/{name}",
    ]) {
      expect(
        api.logs.some((line) => line.includes(`"route":"${route}"`)),
        route,
      ).toBe(true);
    }
    for (const code of [
      "signed_out_everywhere",
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
    await first.signIn();
    const cookie = `__Host-atlas_session=${first.session()}`;
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
    const answer = await api.call("GET", "/api/ledger", { jar: false, cookies: [cookie] });
    expect(answer.statusCode).toBe(500);
    expect(answer.body).not.toContain(BUCKET);
    const everything = [...api.logs, ...captured].join("\n");
    for (const secret of [BUCKET, ARN, "123456789012", "access/", cookie]) {
      expect(everything).not.toContain(secret);
    }
    expect(JSON.parse(api.logs.at(-1) as string)).toMatchObject({
      status: 500,
      code: "internal",
      reason: "AccessDenied",
    });
  });
});
