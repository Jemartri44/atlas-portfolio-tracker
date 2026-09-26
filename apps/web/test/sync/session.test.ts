// Feature 015, E1: what the web learns of its session, and how it closes it
// (docs/api.md §3; P8 (a), B5).

import { describe, expect, it } from "vitest";
import { bodySha256, readSession, signInHref, signOut } from "../../src/sync/session.js";

const ID = "AAAAAAAAAAAAAAAAAAAAAA";

const answering = (status: number, body?: unknown) => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const request = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(
      body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body),
      { status },
    );
  }) as typeof fetch;
  return { request, calls };
};

describe("readSession", () => {
  it("says signed in with the expiry and the device id the API gave", async () => {
    const { request, calls } = answering(200, {
      signed_in: true,
      expires_at: "2026-10-01T18:00:00Z",
      device_id: ID,
    });
    expect(await readSession(request)).toEqual({
      kind: "signed_in",
      expiresAt: "2026-10-01T18:00:00Z",
      deviceId: ID,
    });
    expect(calls[0]?.url).toBe("/api/session");
    expect(calls[0]?.init?.redirect).toBe("error");
    expect(calls[0]?.init?.credentials).toBe("same-origin");
  });

  it("tells every answer apart, each by its code", async () => {
    const cases: [number, unknown, unknown][] = [
      [401, { error: { code: "unauthenticated", details: {} } }, { kind: "signed_out" }],
      [401, { error: { code: "session_invalid", details: {} } }, { kind: "expired" }],
      [403, { error: { code: "not_allowed", details: {} } }, { kind: "not_allowed" }],
      [
        403,
        { error: { code: "device_forgotten", details: { reason: "forgotten" } } },
        { kind: "forgotten" },
      ],
      [
        503,
        { error: { code: "remote_unavailable", details: {} } },
        { kind: "unavailable", code: "remote_unavailable" },
      ],
      [404, "<html>not here</html>", { kind: "unavailable", code: "transport_rejected" }],
      [
        200,
        { signed_in: true, expires_at: "x", device_id: "../bad" },
        { kind: "unavailable", code: "transport_rejected" },
      ],
      [200, "not json", { kind: "unavailable", code: "transport_rejected" }],
    ];
    for (const [status, body, expected] of cases) {
      expect(await readSession(answering(status, body).request)).toEqual(expected);
    }
    const offline = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await readSession(offline)).toEqual({ kind: "unavailable", code: "network_failed" });
  });
});

describe("signing in and out", () => {
  it("navigates to our own origin, presenting the kept id only when well formed", () => {
    expect(signInHref(undefined)).toBe("/api/auth/login");
    expect(signInHref(ID)).toBe(`/api/auth/login?device_id=${ID}`);
  });

  it("closes with {} and the hash of its exact bytes, never with Authorization", async () => {
    const { request, calls } = answering(204);
    expect(await signOut(request)).toBe("signed_out");
    const init = calls[0]?.init as RequestInit;
    expect(calls[0]?.url).toBe("/api/auth/logout");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.redirect).toBe("error");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-amz-content-sha256"]).toBe(await bodySha256("{}"));
    expect(headers["x-amz-content-sha256"]).toBe(
      "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    );
    expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain("authorization");
  });

  it("says why it could not close", async () => {
    expect(
      await signOut(answering(403, { error: { code: "origin_rejected", details: {} } }).request),
    ).toEqual({ code: "origin_rejected" });
    expect(await signOut(answering(502, "bad gateway").request)).toEqual({
      code: "transport_rejected",
    });
    const offline = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await signOut(offline)).toEqual({ code: "network_failed" });
  });
});
