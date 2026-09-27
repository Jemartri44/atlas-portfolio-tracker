// Feature 015, E1: which credential a request brings, which route admits it,
// the Origin of a write and the JSON body (plan §4.1, R02 to R05).

import { describe, expect, it } from "vitest";
import {
  bodyTooLarge,
  expectEmptyObject,
  MAX_BODY_BYTES,
  readJsonBody,
} from "../../src/access/body.js";
import { API_ERRORS, refusal } from "../../src/access/codes.js";
import {
  cookieValues,
  LOGIN_COOKIE,
  parseCookieHeader,
  presentedCredential,
  SESSION_COOKIE,
} from "../../src/access/cookies.js";
import {
  admit,
  findRoute,
  originAccepted,
  ROUTES,
  type RouteSpec,
} from "../../src/access/routes.js";

const SELF = "https://atlas.example";
const route = (path: string, method = "GET"): RouteSpec => findRoute(method, path) as RouteSpec;

describe("the cookies of a request", () => {
  it("reads a Cookie header as pairs, in order, dropping a piece without =", () => {
    expect(parseCookieHeader(" a=1; b = 2 ;junk; c=x=y")).toEqual([
      ["a", "1"],
      ["b", "2"],
      ["c", "x=y"],
    ]);
    expect(
      cookieValues(
        [
          ["a", "1"],
          ["b", "2"],
          ["a", "3"],
        ],
        "a",
      ),
    ).toEqual(["1", "3"]);
  });
});

describe("presentedCredential: exactly one credential (api §2)", () => {
  it("is ambiguous with a session cookie and a token, whatever they hold (R02)", () => {
    expect(presentedCredential([[SESSION_COOKIE, "garbage"]], "not-a-token")).toEqual({
      kind: "ambiguous",
    });
    expect(
      presentedCredential(
        [
          [SESSION_COOKIE, "a"],
          [SESSION_COOKIE, "b"],
        ],
        "",
      ),
    ).toEqual({
      kind: "ambiguous",
    });
  });

  it("is the token, the session, none, or a repeated session — never the first of two", () => {
    expect(presentedCredential([[LOGIN_COOKIE, "x"]], "t")).toEqual({ kind: "token", value: "t" });
    expect(presentedCredential([[LOGIN_COOKIE, "x"]], undefined)).toEqual({ kind: "none" });
    expect(presentedCredential([[SESSION_COOKIE, "s"]], undefined)).toEqual({
      kind: "session",
      value: "s",
    });
    expect(
      presentedCredential(
        [
          [SESSION_COOKIE, "s"],
          [SESSION_COOKIE, "s"],
        ],
        undefined,
      ),
    ).toEqual({
      kind: "session_repeated",
    });
  });
});

describe("the routes and what each admits (api §2.3)", () => {
  it("matches exactly: no prefix, no trailing slash, no other method", () => {
    expect(findRoute("GET", "/api/session")?.policy).toBe("session");
    expect(findRoute("GET", "/api/session/")).toBeUndefined();
    expect(findRoute("POST", "/api/session")).toBeUndefined();
    expect(findRoute("GET", "/API/session")).toBeUndefined();
    // The writes of E1, E2 and E3, each with a JSON body.
    expect(
      ROUTES.filter((spec) => spec.writes).map((spec) => `${spec.method} ${spec.path}`),
    ).toEqual([
      "POST /api/auth/logout",
      "POST /api/auth/console/token",
      "POST /api/auth/console/revoke",
      "POST /api/devices/tokens/{token_id}/revoke",
      "POST /api/ledger/lines",
      "PUT /api/ledger",
      "PUT /api/sync/devices/self",
    ]);
  });

  it("gives the sync and the reference data to both credentials, and the devices to the session (E3)", () => {
    const sync = [
      ["GET", "/api/ledger"],
      ["POST", "/api/ledger/lines"],
      ["PUT", "/api/ledger"],
      ["PUT", "/api/sync/devices/self"],
      ["GET", "/api/reference/index"],
      ["GET", "/api/reference/ecb/{name}"],
      ["GET", "/api/reference/prices/{name}"],
    ] as const;
    for (const [method, path] of sync) {
      expect(findRoute(method, path)?.policy, path).toBe("sync");
    }
    expect(findRoute("GET", "/api/sync/devices")?.policy).toBe("session");
    expect(findRoute("GET", "/api/reference/ecb/a/b")).toBeUndefined();
  });

  it("admits a token or a session on a sync route; with the cookie, a write needs our Origin", () => {
    const lines = route("/api/ledger/lines", "POST");
    const read = route("/api/ledger");
    expect(admit(lines, { kind: "token", value: "t" }, undefined, SELF)).toEqual({
      kind: "token",
      value: "t",
    });
    expect(admit(lines, { kind: "session", value: "v" }, SELF, SELF)).toEqual({
      kind: "session",
      value: "v",
    });
    expect(admit(lines, { kind: "session", value: "v" }, undefined, SELF)).toEqual({
      kind: "refused",
      refusal: refusal("origin_rejected"),
    });
    expect(admit(read, { kind: "session", value: "v" }, undefined, SELF)).toEqual({
      kind: "session",
      value: "v",
    });
    expect(admit(read, { kind: "none" }, undefined, SELF)).toEqual({
      kind: "refused",
      refusal: refusal("unauthenticated"),
    });
    expect(admit(read, { kind: "ambiguous" }, undefined, SELF)).toEqual({
      kind: "refused",
      refusal: refusal("credentials_ambiguous"),
    });
    expect(admit(route("/api/sync/devices"), { kind: "token", value: "t" }, SELF, SELF)).toEqual({
      kind: "refused",
      refusal: refusal("forbidden_for_credential"),
    });
  });

  it("looks at no credential on the start and the return of a sign-in", () => {
    for (const path of ["/api/auth/login", "/api/auth/callback"]) {
      expect(admit(route(path), { kind: "ambiguous" }, undefined, SELF)).toEqual({
        kind: "anonymous",
      });
      expect(admit(route(path), { kind: "token", value: "t" }, undefined, SELF)).toEqual({
        kind: "anonymous",
      });
    }
  });

  it("refuses ambiguity, a token and no credential on a session route, each with its code", () => {
    const session = route("/api/session");
    expect(admit(session, { kind: "ambiguous" }, SELF, SELF)).toEqual({
      kind: "refused",
      refusal: refusal("credentials_ambiguous"),
    });
    expect(admit(session, { kind: "token", value: "t" }, SELF, SELF)).toEqual({
      kind: "refused",
      refusal: refusal("forbidden_for_credential"),
    });
    expect(admit(session, { kind: "none" }, SELF, SELF)).toEqual({
      kind: "refused",
      refusal: refusal("unauthenticated"),
    });
    expect(admit(session, { kind: "session_repeated" }, undefined, SELF)).toEqual({
      kind: "refused",
      refusal: refusal("session_invalid", { reason: "repeated" }),
    });
    expect(admit(session, { kind: "session", value: "v" }, undefined, SELF)).toEqual({
      kind: "session",
      value: "v",
    });
  });

  it("checks Origin on a write with the cookie: foreign **and absent** are refused (R04, N6)", () => {
    const logout = route("/api/auth/logout", "POST");
    const rejected = { kind: "refused", refusal: refusal("origin_rejected") };
    expect(admit(logout, { kind: "session", value: "v" }, "https://evil.example", SELF)).toEqual(
      rejected,
    );
    expect(admit(logout, { kind: "session", value: "v" }, undefined, SELF)).toEqual(rejected);
    expect(admit(logout, { kind: "session_repeated" }, undefined, SELF)).toEqual(rejected);
    expect(admit(logout, { kind: "session", value: "v" }, SELF, SELF)).toEqual({
      kind: "clear_session",
    });
    expect(admit(logout, { kind: "session_repeated" }, SELF, SELF)).toEqual({
      kind: "clear_session",
    });
    expect(originAccepted(`${SELF}/`, SELF)).toBe(false);
  });

  it("closes no session on logout without a cookie, and refuses a token there", () => {
    const logout = route("/api/auth/logout", "POST");
    expect(admit(logout, { kind: "none" }, undefined, SELF)).toEqual({ kind: "anonymous" });
    expect(admit(logout, { kind: "token", value: "t" }, SELF, SELF)).toEqual({
      kind: "refused",
      refusal: refusal("forbidden_for_credential"),
    });
    expect(admit(logout, { kind: "ambiguous" }, SELF, SELF)).toEqual({
      kind: "refused",
      refusal: refusal("credentials_ambiguous"),
    });
  });
});

describe("the body of a write (api §1, R05)", () => {
  it("is JSON by its content type and its syntax, and keeps nothing of a parse error", () => {
    expect(readJsonBody("application/json", "{}")).toEqual({ value: {} });
    expect(readJsonBody("Application/JSON; charset=utf-8", "[1]")).toEqual({ value: [1] });
    expect(readJsonBody(undefined, "{}")).toEqual(
      refusal("body_not_json", { reason: "content_type" }),
    );
    expect(readJsonBody("text/plain", "{}")).toEqual(
      refusal("body_not_json", { reason: "content_type" }),
    );
    const broken = readJsonBody("application/json", "SECRET-CODE is not json");
    expect(broken).toEqual(refusal("body_not_json", { reason: "syntax" }));
    expect(JSON.stringify(broken)).not.toContain("SECRET");
    expect(readJsonBody("application/json", "")).toEqual(
      refusal("body_not_json", { reason: "syntax" }),
    );
  });

  it("wants exactly {} where the route carries nothing", () => {
    expect(expectEmptyObject({})).toBeUndefined();
    for (const value of [[], null, "x", { a: 1 }]) {
      expect(expectEmptyObject(value)).toEqual(
        refusal("body_invalid", { reason: "not_empty_object" }),
      );
    }
  });

  it("bounds the size before reading", () => {
    expect(bodyTooLarge(MAX_BODY_BYTES)).toBeUndefined();
    expect(bodyTooLarge(MAX_BODY_BYTES + 1)).toEqual(
      refusal("body_too_large", { limit: MAX_BODY_BYTES }),
    );
    expect(API_ERRORS.body_too_large).toBe(413);
  });
});
