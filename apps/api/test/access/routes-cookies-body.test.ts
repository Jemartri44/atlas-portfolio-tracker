// Which credential a request brings, which route admits it, the Origin of a write and the JSON
// body.

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
  matchRoute,
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

describe("presentedCredential: the session cookie, once (api §2)", () => {
  it("is the session, none, or a repeated session — never the first of two", () => {
    expect(presentedCredential([[LOGIN_COOKIE, "x"]])).toEqual({ kind: "none" });
    expect(presentedCredential([[SESSION_COOKIE, "s"]])).toEqual({ kind: "session", value: "s" });
    expect(
      presentedCredential([
        [SESSION_COOKIE, "s"],
        [SESSION_COOKIE, "s"],
      ]),
    ).toEqual({ kind: "session_repeated" });
  });
});

describe("the routes and what each admits (api §2.3)", () => {
  it("matches exactly: no prefix, no trailing slash, no other method", () => {
    expect(findRoute("GET", "/api/session")?.policy).toBe("session");
    expect(findRoute("GET", "/api/session/")).toBeUndefined();
    expect(findRoute("POST", "/api/session")).toBeUndefined();
    expect(findRoute("GET", "/API/session")).toBeUndefined();
    // The writes, each with a JSON body.
    expect(
      ROUTES.filter((spec) => spec.writes).map((spec) => `${spec.method} ${spec.path}`),
    ).toEqual([
      "POST /api/auth/logout",
      "POST /api/auth/logout-all",
      "POST /api/ledger/lines",
      "POST /api/drafts",
      "POST /api/drafts/{id}/stamp",
      "POST /api/drafts/{id}/end",
      "PUT /api/exposure",
    ]);
    expect(findRoute("PUT", "/api/exposure")?.policy).toBe("session");
    expect(findRoute("GET", "/api/exposure")?.writes).toBe(false);
    expect(findRoute("POST", "/api/exposure")).toBeUndefined();
  });

  it("gives every route but the sign-in and the logout to the session cookie alone", () => {
    expect(ROUTES.filter((spec) => spec.policy !== "session").map((spec) => spec.path)).toEqual([
      "/api/auth/login",
      "/api/auth/callback",
      "/api/auth/logout",
    ]);
    expect(matchRoute("POST", "/api/drafts/01J0000000000000000000000A/end")?.params).toEqual({
      id: "01J0000000000000000000000A",
    });
    expect(findRoute("DELETE", "/api/drafts/01J0000000000000000000000A")).toBeUndefined();
    expect(findRoute("POST", "/api/drafts/a/b/end")).toBeUndefined();
    expect(findRoute("GET", "/api/reference/ecb/a/b")).toBeUndefined();
    // Retired: the first upload is `atlas admin restore`, and there is no console to sign in.
    expect(findRoute("PUT", "/api/ledger")).toBeUndefined();
    expect(findRoute("GET", "/api/auth/console/start")).toBeUndefined();
  });

  it("admits the session; with it, a write needs our Origin", () => {
    const lines = route("/api/ledger/lines", "POST");
    const read = route("/api/ledger");
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
    expect(admit(read, { kind: "session_repeated" }, undefined, SELF)).toEqual({
      kind: "refused",
      refusal: refusal("session_invalid", { reason: "repeated" }),
    });
  });

  it("looks at no credential on the start and the return of a sign-in", () => {
    for (const path of ["/api/auth/login", "/api/auth/callback"]) {
      expect(admit(route(path), { kind: "session_repeated" }, undefined, SELF)).toEqual({
        kind: "anonymous",
      });
    }
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
    // Closing every session is a session route: from our own origin, with a valid cookie.
    expect(
      admit(
        route("/api/auth/logout-all", "POST"),
        { kind: "session", value: "v" },
        undefined,
        SELF,
      ),
    ).toEqual(rejected);
  });

  it("closes no session on logout without a cookie", () => {
    const logout = route("/api/auth/logout", "POST");
    expect(admit(logout, { kind: "none" }, undefined, SELF)).toEqual({ kind: "anonymous" });
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
