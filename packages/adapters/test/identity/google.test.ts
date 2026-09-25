// Feature 015, E1: Google as identity provider, against a fake `fetch`: the
// authorisation address, the exchange, and the cache of the keys by its
// `max-age` (block 0, §1.1).

import {
  GOOGLE_ISSUERS,
  GOOGLE_JWKS_URI,
  GOOGLE_TOKEN_ENDPOINT,
  GoogleIdentity,
  IdentityUnavailable,
} from "@atlas/adapters/identity";
import { describe, expect, it } from "vitest";

const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const fakeFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), ...(init === undefined ? {} : { init }) });
    return handler(String(url), init);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
};

describe("GoogleIdentity", () => {
  it("names the two issuers of the documentation, exactly", () => {
    expect(GOOGLE_ISSUERS).toEqual(["https://accounts.google.com", "accounts.google.com"]);
  });

  it("builds the authorisation with code, PKCE S256, state, nonce and openid email", () => {
    const google = new GoogleIdentity({ fetch: fakeFetch(() => json({})).fetch, now: () => 0 });
    const url = new URL(
      google.authorizationUrl({
        clientId: "c",
        redirectUri: "https://a.example/api/auth/callback",
        state: "s",
        nonce: "n",
        codeChallenge: "cc",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "c",
      redirect_uri: "https://a.example/api/auth/callback",
      scope: "openid email",
      state: "s",
      nonce: "n",
      code_challenge: "cc",
      code_challenge_method: "S256",
    });
    const prompted = new URL(
      google.authorizationUrl({
        clientId: "c",
        redirectUri: "r",
        state: "s",
        nonce: "n",
        codeChallenge: "cc",
        prompt: "select_account",
      }),
    );
    expect(prompted.searchParams.get("prompt")).toBe("select_account");
  });

  it("exchanges the code directly with Google, with the verifier, and returns the ID token", async () => {
    const { fetch, calls } = fakeFetch(() => json({ id_token: "a.b.c", access_token: "x" }));
    const google = new GoogleIdentity({ fetch, now: () => 0 });
    await expect(
      google.exchangeCode({
        clientId: "c",
        clientSecret: "s",
        code: "k",
        verifier: "v",
        redirectUri: "r",
      }),
    ).resolves.toBe("a.b.c");
    expect(calls[0]?.url).toBe(GOOGLE_TOKEN_ENDPOINT);
    expect(calls[0]?.init?.redirect).toBe("error");
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.init?.body as string))).toEqual({
      grant_type: "authorization_code",
      code: "k",
      code_verifier: "v",
      client_id: "c",
      client_secret: "s",
      redirect_uri: "r",
    });
  });

  it("fails the exchange with a code of its own, never with the body of Google", async () => {
    const cases: [() => Response | Promise<Response>, string][] = [
      [() => json({ error: "invalid_grant SECRET" }, { status: 400 }), "status_400"],
      [() => json({ no: "token" }), "shape"],
      [() => new Response("not json SECRET", { status: 200 }), "shape"],
      [() => Promise.reject(new Error("ECONNRESET SECRET")), "network"],
    ];
    for (const [handler, reason] of cases) {
      const google = new GoogleIdentity({ fetch: fakeFetch(handler).fetch, now: () => 0 });
      const error = await google
        .exchangeCode({
          clientId: "c",
          clientSecret: "s",
          code: "k",
          verifier: "v",
          redirectUri: "r",
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(IdentityUnavailable);
      expect((error as IdentityUnavailable).reason).toBe(reason);
      expect(String((error as Error).message)).not.toContain("SECRET");
    }
  });

  it("caches the keys by max-age, reloads at most once a minute for an unknown kid, and caps the cache", async () => {
    let now = 0;
    let generation = 1;
    const { fetch, calls } = fakeFetch((url) => {
      expect(url).toBe(GOOGLE_JWKS_URI);
      return json(
        { keys: [{ kid: `k${generation}`, kty: "RSA" }, { nokid: true }] },
        { headers: { "cache-control": "public, max-age=100, must-revalidate" } },
      );
    });
    const google = new GoogleIdentity({ fetch, now: () => now, maxKeyCacheMs: 50_000 });
    expect(await google.publicKey("k1")).toEqual({ kid: "k1", kty: "RSA" });
    expect(calls).toHaveLength(1);
    now = 10_000;
    generation = 2;
    expect(await google.publicKey("k2")).toBeUndefined(); // within the floor: no reload
    expect(calls).toHaveLength(1);
    now = 61_000; // past the ceiling of 50 s (max-age said 100 s)
    expect(await google.publicKey("k2")).toEqual({ kid: "k2", kty: "RSA" });
    expect(calls).toHaveLength(2);
    now = 105_000;
    generation = 3;
    expect(await google.publicKey("k3")).toBeUndefined();
    expect(calls).toHaveLength(2);
    now = 125_000; // unknown kid, a minute after the last load, cache still valid
    expect(await google.publicKey("k3")).toEqual({ kid: "k3", kty: "RSA" });
    expect(calls).toHaveLength(3);
  });

  it("does not cache keys served without max-age, and fails with its code when they cannot be read", async () => {
    const plain = fakeFetch(() => json({ keys: [{ kid: "k1" }] }));
    const google = new GoogleIdentity({ fetch: plain.fetch, now: () => 5 });
    await google.publicKey("k1");
    await google.publicKey("k1");
    expect(plain.calls).toHaveLength(2);
    for (const [handler, reason] of [
      [() => json({ keys: "x" }), "keys_shape"],
      [() => json({ keys: [] }, { status: 500 }), "keys_shape"],
      [() => new Response("<html>", { status: 200 }), "keys_shape"],
      [() => Promise.reject(new Error("down")), "keys_network"],
    ] as [() => Response | Promise<Response>, string][]) {
      const failing = new GoogleIdentity({ fetch: fakeFetch(handler).fetch, now: () => 0 });
      await expect(failing.publicKey("k1")).rejects.toMatchObject({ reason });
    }
  });
});
