// The identity provider as the API sees it (feature 015; ADR-0027, way c):
// build the address of the authorisation, exchange a code for an ID token,
// and give the public key of a `kid`. Google implements it (`google.ts`); the
// tests and the local server of the captures, with a double that signs with
// keys generated in the test. **The addresses of Google are not a setting**:
// a double is another implementation of this port, never Google's code
// pointed elsewhere (plan §11).

import type { JsonWebKey } from "node:crypto";

export interface AuthorizationRequest {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeChallenge: string;
  /** `select_account` forces the interactive screen (ADR-0033, point 2). */
  readonly prompt?: "select_account";
}

export interface CodeExchange {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly code: string;
  readonly verifier: string;
  readonly redirectUri: string;
}

export interface IdentityProvider {
  /** The exact `iss` values an ID token of this provider may carry. */
  readonly issuers: readonly string[];
  authorizationUrl(request: AuthorizationRequest): string;
  /** The ID token, or `IdentityUnavailable`. */
  exchangeCode(exchange: CodeExchange): Promise<string>;
  /** The key of `kid`, or nothing if the provider does not publish it. */
  publicKey(kid: string): Promise<JsonWebKey | undefined>;
}

/** The provider did not answer as it should: network, status or shape. Carries a code, never its body. */
export class IdentityUnavailable extends Error {
  constructor(readonly reason: string) {
    super(`identity provider unavailable: ${reason}`);
    this.name = "IdentityUnavailable";
  }
}
