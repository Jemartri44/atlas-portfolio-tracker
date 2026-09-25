// What an ID token of Google has to say before anyone is let in (ADR-0027,
// «Verificación», in this order and rejecting at the first failure). The
// signature is checked by the adapter, with the public key of `kid`, between
// the header and the claims; **the accepted issuers are given by the identity
// adapter**, which is the only place allowed to name Google (§2 bis).

import { isRecord } from "../guards.js";
import { isSubject } from "./signed.js";

export type IdTokenFailure =
  | "id_token_invalid"
  | "id_token_audience"
  | "id_token_issuer"
  | "id_token_expired"
  | "id_token_nonce"
  | "email_not_verified";

/** A compact JWS: three base64url segments, bounded. */
export const splitJwt = (
  token: string,
):
  | {
      readonly header: string;
      readonly payload: string;
      readonly signature: string;
      readonly signingInput: string;
    }
  | undefined => {
  const match = /^([A-Za-z0-9_-]{1,2048})\.([A-Za-z0-9_-]{1,8192})\.([A-Za-z0-9_-]{1,2048})$/.exec(
    token,
  );
  if (match === null) {
    return undefined;
  }
  const [, header, payload, signature] = match as unknown as [string, string, string, string];
  return { header, payload, signature, signingInput: `${header}.${payload}` };
};

/**
 * Only RS256 (block 0, §1.1: Google signs with nothing else). `none` and
 * `HS256` — the public key used as an HMAC secret — are the classic ways in;
 * a header asking for anything else is refused before any key is looked up.
 */
export const checkIdTokenHeader = (
  header: unknown,
): { readonly kid: string } | "id_token_invalid" => {
  if (!isRecord(header) || header.alg !== "RS256" || "crit" in header) {
    return "id_token_invalid";
  }
  if (typeof header.kid !== "string" || !/^[\x21-\x7e]{1,256}$/.test(header.kid)) {
    return "id_token_invalid";
  }
  return header.typ === undefined || header.typ === "JWT"
    ? { kid: header.kid }
    : "id_token_invalid";
};

export interface IdTokenExpectation {
  /** The client id **of this environment**: `dev` never accepts a token for `prod`. */
  readonly audience: string;
  readonly issuers: readonly string[];
  readonly nonce: string;
  readonly nowSeconds: number;
}

/** The claims, in the order of ADR-0027: `aud`, `iss`, `exp`, `nonce`, `email_verified`, then the pair. */
export const checkIdTokenClaims = (
  claims: unknown,
  expect: IdTokenExpectation,
): { readonly sub: string; readonly email: string } | IdTokenFailure => {
  if (!isRecord(claims)) {
    return "id_token_invalid";
  }
  if (claims.aud !== expect.audience) {
    return "id_token_audience";
  }
  if (typeof claims.iss !== "string" || !expect.issuers.includes(claims.iss)) {
    return "id_token_issuer";
  }
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) {
    return "id_token_invalid";
  }
  if (claims.exp <= expect.nowSeconds) {
    return "id_token_expired";
  }
  if (claims.nonce !== expect.nonce) {
    return "id_token_nonce";
  }
  // `true`, the boolean: the string "true" is not a verified address.
  if (claims.email_verified !== true) {
    return "email_not_verified";
  }
  if (!isSubject(claims.sub) || typeof claims.email !== "string" || claims.email.length === 0) {
    return "id_token_invalid";
  }
  return { sub: claims.sub, email: claims.email };
};
