// The payloads the API signs: the cookie of the session and the transient
// cookie of an attempt. **Each purpose has its own subkey, derived with HKDF
// from the session key, and its own `typ`**, and every reader rejects the
// foreign one. The MAC is the
// adapter's (`node:crypto`); the order and the reading of the payload are here.
//
// No cookie carries the e-mail: only the `sub` and
// what is indispensable. That is why signing without encrypting is enough.

import { isRecord } from "../guards.js";
import { isId22, isId43 } from "./ids.js";

export const SIGNING = {
  session: { info: "atlas session v1", typ: "atlas.session" },
  login: { info: "atlas login v1", typ: "atlas.login" },
} as const;

export type SigningPurpose = keyof typeof SIGNING;

/** `<payload>.<mac>`, both base64url; the payload bounded, the MAC of HMAC-SHA256 (43). */
export const splitSigned = (
  text: string,
): { readonly payload: string; readonly mac: string } | undefined => {
  const match = /^([A-Za-z0-9_-]{1,4096})\.([A-Za-z0-9_-]{43})$/.exec(text);
  return match === null ? undefined : { payload: match[1] as string, mac: match[2] as string };
};

/** A Google `sub`: up to 255 printable ASCII characters (OpenID Connect Core, §2). */
export const isSubject = (value: unknown): value is string =>
  typeof value === "string" && /^[\x21-\x7e]{1,255}$/.test(value);

const isSeconds = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export interface SessionPayload {
  readonly typ: "atlas.session";
  readonly v: 1;
  readonly sub: string;
  /** Session id: 128 random bits. Never logged. */
  readonly sid: string;
  readonly iat: number;
  readonly exp: number;
}

export interface LoginPayload {
  readonly typ: "atlas.login";
  readonly v: 1;
  readonly iat: number;
  readonly exp: number;
  readonly state: string;
  readonly nonce: string;
  /** The PKCE verifier towards Google. */
  readonly verifier: string;
}

export type PayloadReading<P> =
  | { readonly ok: P }
  | { readonly failure: "invalid" }
  | { readonly failure: "expired" };

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean =>
  required.every((key) => key in value) &&
  Object.keys(value).every((key) => required.includes(key) || optional.includes(key));

/**
 * Reads a payload whose MAC was already checked with **this purpose's** subkey:
 * strict JSON, then `typ`, then `v`, then the expiry. A payload of another
 * purpose never gets here (other subkey), and if a broken implementation shared
 * the subkey it would still fail on `typ`: the two barriers, each with its own
 * test.
 */
const readPayload = <P>(
  json: string,
  purpose: SigningPurpose,
  nowSeconds: number,
  shape: (value: Record<string, unknown>) => boolean,
): PayloadReading<P> => {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { failure: "invalid" };
  }
  if (!isRecord(value) || value.typ !== SIGNING[purpose].typ || value.v !== 1 || !shape(value)) {
    return { failure: "invalid" };
  }
  if (!isSeconds(value.iat) || !isSeconds(value.exp) || value.exp <= value.iat) {
    return { failure: "invalid" };
  }
  return value.exp <= nowSeconds ? { failure: "expired" } : { ok: value as P };
};

export const readSessionPayload = (
  json: string,
  nowSeconds: number,
): PayloadReading<SessionPayload> =>
  readPayload<SessionPayload>(
    json,
    "session",
    nowSeconds,
    (value) =>
      exactKeys(value, ["typ", "v", "sub", "sid", "iat", "exp"]) &&
      isSubject(value.sub) &&
      isId22(value.sid),
  );

export const readLoginPayload = (json: string, nowSeconds: number): PayloadReading<LoginPayload> =>
  readPayload<LoginPayload>(
    json,
    "login",
    nowSeconds,
    (value) =>
      exactKeys(value, ["typ", "v", "iat", "exp", "state", "nonce", "verifier"]) &&
      isId43(value.state) &&
      isId43(value.nonce) &&
      isId43(value.verifier),
  );

export const sessionPayload = (fields: {
  sub: string;
  sid: string;
  now: number;
  ttlSeconds: number;
}): SessionPayload => ({
  typ: "atlas.session",
  v: 1,
  sub: fields.sub,
  sid: fields.sid,
  iat: fields.now,
  exp: fields.now + fields.ttlSeconds,
});

export const loginPayload = (fields: {
  state: string;
  nonce: string;
  verifier: string;
  now: number;
  ttlSeconds: number;
}): LoginPayload => ({
  typ: "atlas.login",
  v: 1,
  iat: fields.now,
  exp: fields.now + fields.ttlSeconds,
  state: fields.state,
  nonce: fields.nonce,
  verifier: fields.verifier,
});
