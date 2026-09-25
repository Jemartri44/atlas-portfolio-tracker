// Feature 015, E1: nothing secret or personal ever reaches a log (§2 bis; R25;
// N3). Every route is walked with recognisable values — an e-mail, a `sub`, a
// secret of the client, the session key, a device token, a line with an
// amount, bodies that **start** with the sentinel — and `stdout`, `stderr`,
// `console` and the logger itself are captured: none may carry any of them,
// nor the cookies, the session id, the code or the verifier of an attempt.

import { base64url, Signer } from "@atlas/adapters/access";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowListOf, NAMES, SELF, setup } from "./harness.js";

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
    const everything = [...api.logs, ...captured].join("\n");
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
    for (const line of api.logs) {
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
});
