// TEST ONLY — a double of Google as identity provider, never reachable from
// the product. It signs ID tokens with an RSA key **generated here**, keeps
// the codes it issued (single use, bound to the client, the redirect and the
// PKCE challenge, as RFC 7636 wants) and names no address of Google: its
// issuers and its authorisation page are its own.

import {
  createHash,
  generateKeyPairSync,
  type JsonWebKey,
  type KeyObject,
  sign,
} from "node:crypto";
import {
  type AuthorizationRequest,
  type CodeExchange,
  type IdentityProvider,
  IdentityUnavailable,
} from "@atlas/adapters/identity";

export interface FakeAccount {
  readonly sub: string;
  readonly email: string;
  readonly email_verified?: unknown;
}

const b64 = (value: Buffer | string): string => Buffer.from(value).toString("base64url");

export class TestOnlyFakeGoogle implements IdentityProvider {
  readonly issuers = ["https://fake-idp.test", "fake-idp.test"] as const;
  readonly kid = "fake-k1";
  private readonly privateKey: KeyObject;
  private readonly jwk: JsonWebKey;
  private readonly codes = new Map<
    string,
    { request: AuthorizationRequest; account: FakeAccount; claims: Record<string, unknown> }
  >();
  private counter = 0;
  exchanges = 0;
  down = false;
  /** Overrides applied to the claims of the next token (to forge one). */
  nextClaims: Record<string, unknown> = {};

  constructor(
    private readonly clientSecret: string,
    private readonly authorizeBase = "https://fake-idp.test/authorize",
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    this.privateKey = pair.privateKey;
    this.jwk = {
      ...pair.publicKey.export({ format: "jwk" }),
      kid: this.kid,
      alg: "RS256",
      use: "sig",
    };
  }

  authorizationUrl(request: AuthorizationRequest): string {
    const url = new URL(this.authorizeBase);
    url.searchParams.set("client_id", request.clientId);
    url.searchParams.set("redirect_uri", request.redirectUri);
    url.searchParams.set("state", request.state);
    url.searchParams.set("nonce", request.nonce);
    url.searchParams.set("code_challenge", request.codeChallenge);
    if (request.prompt !== undefined) {
      url.searchParams.set("prompt", request.prompt);
    }
    return url.toString();
  }

  /** The user chooses `account` on the page of the provider: a code for the redirect. */
  authorize(
    authorizationUrl: string,
    account: FakeAccount,
  ): { code: string; state: string; redirectUri: string } {
    const url = new URL(authorizationUrl);
    const get = (name: string): string => url.searchParams.get(name) as string;
    this.counter += 1;
    const code = `fake-code-${this.counter}`;
    this.codes.set(code, {
      request: {
        clientId: get("client_id"),
        redirectUri: get("redirect_uri"),
        state: get("state"),
        nonce: get("nonce"),
        codeChallenge: get("code_challenge"),
      },
      account,
      claims: { ...this.nextClaims },
    });
    this.nextClaims = {};
    return { code, state: get("state"), redirectUri: get("redirect_uri") };
  }

  async exchangeCode(exchange: CodeExchange): Promise<string> {
    this.exchanges += 1;
    if (this.down) {
      throw new IdentityUnavailable("network");
    }
    const issued = this.codes.get(exchange.code);
    this.codes.delete(exchange.code);
    const challenge = createHash("sha256").update(exchange.verifier, "ascii").digest("base64url");
    if (
      issued === undefined ||
      issued.request.clientId !== exchange.clientId ||
      issued.request.redirectUri !== exchange.redirectUri ||
      issued.request.codeChallenge !== challenge ||
      exchange.clientSecret !== this.clientSecret
    ) {
      throw new IdentityUnavailable("status_400");
    }
    const now = this.nowSeconds();
    return this.token(
      { alg: "RS256", kid: this.kid, typ: "JWT" },
      {
        iss: this.issuers[0],
        aud: exchange.clientId,
        sub: issued.account.sub,
        email: issued.account.email,
        email_verified: "email_verified" in issued.account ? issued.account.email_verified : true,
        nonce: issued.request.nonce,
        iat: now,
        exp: now + 3600,
        ...issued.claims,
      },
    );
  }

  /** Signs any header and claims with the key of the double; `{ alg: "none" }` and HS256 forge by hand. */
  token(header: Record<string, unknown>, claims: Record<string, unknown>): string {
    const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(claims))}`;
    return `${input}.${b64(sign("RSA-SHA256", Buffer.from(input), this.privateKey))}`;
  }

  get publicJwk(): JsonWebKey {
    return this.jwk;
  }

  async publicKey(kid: string): Promise<JsonWebKey | undefined> {
    return kid === this.kid ? this.jwk : undefined;
  }
}
