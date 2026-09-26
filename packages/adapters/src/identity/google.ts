// Google as the identity provider (ADR-0027). The addresses and the issuers
// are **fixed here**, from the documentation consulted on 2026-09-25 (block 0
// of E1, `specs/015-api-access/questions.md` §1.1): the discovery document of
// `accounts.google.com`, its `jwks_uri`, and «the iss claim … is equal to
// https://accounts.google.com or accounts.google.com». This is the **only**
// file of the product allowed to name Google (architecture test).
//
// The keys are cached by the `max-age` of the response («you can cache them
// using the cache directives of the HTTP response»), bounded by a ceiling of
// our own; an unknown `kid` reloads them at most once per minute, and a key
// that is still not there is refused.

import type { JsonWebKey } from "node:crypto";
import {
  type AuthorizationRequest,
  type CodeExchange,
  type IdentityProvider,
  IdentityUnavailable,
} from "./provider.js";

export const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"] as const;

export interface GoogleOptions {
  readonly fetch: typeof fetch;
  readonly now: () => number;
  /** Ceiling of the cache of the keys, whatever the `max-age` says. */
  readonly maxKeyCacheMs?: number;
  /** An unknown `kid` reloads the keys no more often than this. */
  readonly reloadFloorMs?: number;
}

const maxAgeMs = (cacheControl: string | null): number => {
  const match = /(?:^|,)\s*max-age=(\d{1,9})\s*(?:,|$)/.exec(cacheControl ?? "");
  return match === null ? 0 : Number(match[1]) * 1000;
};

export class GoogleIdentity implements IdentityProvider {
  readonly issuers: readonly string[] = GOOGLE_ISSUERS;
  private keys: { readonly byKid: Map<string, JsonWebKey>; readonly until: number } | undefined;
  private lastLoad = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: GoogleOptions) {}

  authorizationUrl(request: AuthorizationRequest): string {
    const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", request.clientId);
    url.searchParams.set("redirect_uri", request.redirectUri);
    url.searchParams.set("scope", "openid email");
    url.searchParams.set("state", request.state);
    url.searchParams.set("nonce", request.nonce);
    url.searchParams.set("code_challenge", request.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (request.prompt !== undefined) {
      url.searchParams.set("prompt", request.prompt);
    }
    return url.toString();
  }

  async exchangeCode(exchange: CodeExchange): Promise<string> {
    let response: Response;
    try {
      response = await this.options.fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: exchange.code,
          code_verifier: exchange.verifier,
          client_id: exchange.clientId,
          client_secret: exchange.clientSecret,
          redirect_uri: exchange.redirectUri,
        }).toString(),
      });
    } catch {
      throw new IdentityUnavailable("network");
    }
    if (response.status !== 200) {
      throw new IdentityUnavailable(`status_${response.status}`);
    }
    const body = (await response.json().catch(() => undefined)) as
      | { id_token?: unknown }
      | undefined;
    if (typeof body?.id_token !== "string") {
      throw new IdentityUnavailable("shape");
    }
    return body.id_token;
  }

  private async load(): Promise<void> {
    const at = this.options.now();
    this.lastLoad = at;
    let response: Response;
    try {
      response = await this.options.fetch(GOOGLE_JWKS_URI, { redirect: "error" });
    } catch {
      throw new IdentityUnavailable("keys_network");
    }
    const body = (await response.json().catch(() => undefined)) as { keys?: unknown } | undefined;
    if (response.status !== 200 || !Array.isArray(body?.keys)) {
      throw new IdentityUnavailable("keys_shape");
    }
    const byKid = new Map<string, JsonWebKey>();
    for (const key of body.keys as { kid?: unknown }[]) {
      if (typeof key?.kid === "string") {
        byKid.set(key.kid, key as JsonWebKey);
      }
    }
    const ceiling = this.options.maxKeyCacheMs ?? 24 * 3600 * 1000;
    this.keys = {
      byKid,
      until: at + Math.min(maxAgeMs(response.headers.get("cache-control")), ceiling),
    };
  }

  async publicKey(kid: string): Promise<JsonWebKey | undefined> {
    const at = this.options.now();
    if (this.keys === undefined || this.keys.until <= at) {
      await this.load();
    } else if (
      !this.keys.byKid.has(kid) &&
      at - this.lastLoad >= (this.options.reloadFloorMs ?? 60 * 1000)
    ) {
      await this.load();
    }
    return this.keys?.byKid.get(kid);
  }
}
