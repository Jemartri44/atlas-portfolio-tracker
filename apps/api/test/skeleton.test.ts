// Feature 015, E1, block 2: the skeleton of the handler — routing, the shape
// of an error, the credentials, Origin, the body (plan §4.1, R01 to R05, R24,
// R29).

import { describe, expect, it } from "vitest";
import { ALLOWED, errorOf, SELF, setup } from "./harness.js";

const JSON_HEADERS = { "content-type": "application/json", origin: SELF };

describe("routing and the shape of an error (R29)", () => {
  it("answers 404 not_found to an unknown path or method, exactly", async () => {
    const api = setup();
    for (const [method, path] of [
      ["GET", "/api/nothing"],
      ["GET", "/api/session/"],
      ["POST", "/api/session"],
      ["DELETE", "/api/auth/logout"],
      ["GET", "/api/ledger"],
    ]) {
      const result = await api.call(method as string, path as string);
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toEqual({ error: { code: "not_found", details: {} } });
      expect(result.headers["content-type"]).toBe("application/json; charset=utf-8");
    }
  });

  it("gives every error the shape of docs/api.md §7 and no sentence", async () => {
    const api = setup();
    for (const result of [
      await api.call("GET", "/api/session"),
      await api.call("POST", "/api/auth/logout", { headers: { origin: SELF }, body: "x" }),
      await api.call("GET", "/nope"),
    ]) {
      const body = JSON.parse(result.body);
      expect(Object.keys(body)).toEqual(["error"]);
      expect(Object.keys(body.error).sort()).toEqual(["code", "details"]);
    }
  });

  it("answers 500 internal to what nobody expected, and writes nothing", async () => {
    const api = setup({
      objects: {
        get: async () => {
          throw new TypeError("boom with the SECRET-CODE inside");
        },
        putIfNoneMatch: async () => "created",
        putIfMatch: async () => "written",
        list: async () => [],
      },
    });
    await api.signIn();
    const result = await api.call("GET", "/api/session");
    expect(result.statusCode).toBe(500);
    expect(errorOf(result)).toEqual({ code: "internal", details: {} });
    expect(api.logs.at(-1)).toContain('"reason":"TypeError"');
    expect(api.logs.join("\n")).not.toContain("SECRET");
  });
});

describe("the credentials (R01 to R03)", () => {
  it("refuses a cookie and a token together without reading either (R02)", async () => {
    const api = setup();
    const result = await api.call("GET", "/api/session", {
      cookies: ["__Host-atlas_session=garbage"],
      headers: { "x-atlas-device-token": "not-a-token" },
    });
    expect(result.statusCode).toBe(400);
    expect(errorOf(result).code).toBe("credentials_ambiguous");
    expect(api.ssm.reads).toEqual([]);
    expect(api.s3.calls).toEqual([]);
  });

  it("answers 401 without a credential and 403 to a token on a session route (R03)", async () => {
    const api = setup();
    expect(errorOf(await api.call("GET", "/api/session")).code).toBe("unauthenticated");
    const token = await api.call("GET", "/api/session", {
      headers: { "X-Atlas-Device-Token": "t" },
    });
    expect(token.statusCode).toBe(403);
    expect(errorOf(token).code).toBe("forbidden_for_credential");
  });

  it("never takes Authorization for a credential (R01)", async () => {
    const api = setup();
    await api.signIn();
    const session = api.session() as string;
    const result = await api.call("GET", "/api/session", {
      jar: false,
      headers: { authorization: `Bearer ${session}` },
    });
    expect(errorOf(result).code).toBe("unauthenticated");
  });

  it("reads the cookies of the header too, and the names of the headers in any case", async () => {
    const api = setup();
    await api.signIn();
    const session = api.session() as string;
    const result = await api.call("GET", "/api/session", {
      jar: false,
      headers: { Cookie: `x=1; __Host-atlas_session=${session}` },
    });
    expect(result.statusCode).toBe(200);
  });
});

describe("a write (R04, R05)", () => {
  it("checks Origin when the cookie comes: a foreign one and an absent one are refused (N6)", async () => {
    const api = setup();
    await api.signIn(ALLOWED);
    for (const headers of [
      { "content-type": "application/json", origin: "https://evil.example" },
      { "content-type": "application/json" },
      { "content-type": "application/json", origin: `${SELF}.evil.example` },
    ]) {
      const result = await api.call("POST", "/api/auth/logout", { headers, body: "{}" });
      expect(result.statusCode).toBe(403);
      expect(errorOf(result).code).toBe("origin_rejected");
      expect(result.cookies ?? []).toEqual([]);
    }
    expect(api.session()).toBeDefined();
    const ok = await api.call("POST", "/api/auth/logout", {
      headers: { "Content-Type": "application/json", Origin: SELF },
      body: "{}",
    });
    expect(ok.statusCode).toBe(204);
  });

  it("wants a JSON body: by its type, its syntax and its encoding (R05)", async () => {
    const api = setup();
    const cases: [Record<string, string>, string | undefined, boolean, string][] = [
      [{ origin: SELF }, "{}", false, "content_type"],
      [{ ...JSON_HEADERS, "content-type": "text/plain" }, "{}", false, "content_type"],
      [JSON_HEADERS, "{", false, "syntax"],
      [JSON_HEADERS, undefined, false, "syntax"],
      [JSON_HEADERS, Buffer.from([0xff, 0xfe]).toString("base64"), true, "encoding"],
    ];
    for (const [headers, body, base64, reason] of cases) {
      const result = await api.call("POST", "/api/auth/logout", {
        headers,
        ...(body === undefined ? {} : { body }),
        base64,
      });
      expect(result.statusCode).toBe(415);
      expect(errorOf(result)).toEqual({ code: "body_not_json", details: { reason } });
    }
    const encoded = await api.call("POST", "/api/auth/logout", {
      headers: JSON_HEADERS,
      body: Buffer.from("{}").toString("base64"),
      base64: true,
    });
    expect(encoded.statusCode).toBe(204);
  });

  it("refuses a body over the bound before reading it", async () => {
    const api = setup();
    const result = await api.call("POST", "/api/auth/logout", {
      headers: JSON_HEADERS,
      body: " ".repeat(5 * 1024 * 1024 + 1),
    });
    expect(result.statusCode).toBe(413);
    expect(errorOf(result).code).toBe("body_too_large");
  });
});

describe("no data route redirects (R24)", () => {
  it("answers 3xx only on the start and the return of a sign-in", async () => {
    const api = setup();
    await api.signIn();
    const answers = [
      await api.call("GET", "/api/session"),
      await api.call("GET", "/api/session", { jar: false }),
      await api.call("POST", "/api/auth/logout", { headers: JSON_HEADERS, body: "{}" }),
      await api.call("GET", "/api/else"),
    ];
    for (const result of answers) {
      expect(result.statusCode < 300 || result.statusCode >= 400).toBe(true);
      expect(result.headers.location).toBeUndefined();
    }
  });
});

describe("the level of each log line (N4 of the review of PR #90)", () => {
  it("is ERROR for a 5xx, WARN for a 4xx and INFO otherwise", async () => {
    const levelOf = (line: string | undefined): string =>
      (JSON.parse(line as string) as { level: string }).level;
    const api = setup();
    await api.call("GET", "/api/auth/login");
    expect(levelOf(api.logs.at(-1))).toBe("INFO");
    await api.call("GET", "/api/nothing");
    expect(levelOf(api.logs.at(-1))).toBe("WARN");
    await api.signIn();
    expect(levelOf(api.logs.at(-1))).toBe("INFO");
    api.ssm.throttleNext();
    api.advance(3_600_000);
    await api.call("GET", "/api/session");
    expect(levelOf(api.logs.at(-1))).toBe("ERROR");
    expect((await api.call("GET", "/api/session")).statusCode).toBe(200);
    expect(levelOf(api.logs.at(-1))).toBe("INFO");
  });
});
