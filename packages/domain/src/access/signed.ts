// The payloads the API signs (`specs/015-api-access/data-model.md` §1): the
// cookie of the session, the transient cookie of an attempt and, from E2, the
// one-time code of the console. **Each purpose has its own subkey, derived
// with HKDF from the session key, and its own `typ`**, and every reader
// rejects the foreign one (ADR-0033, point 2, blocking B3). The MAC is the
// adapter's (`node:crypto`); the order and the reading of the payload are here.
//
// No cookie carries the e-mail (decision of 2026-09-25): only the `sub` and
// what is indispensable. That is why signing without encrypting is enough.

import { isRecord } from "../guards.js";
import { isId22, isId43 } from "./ids.js";

export const SIGNING = {
  session: { info: "atlas session v1", typ: "atlas.session" },
  login: { info: "atlas login v1", typ: "atlas.login" },
  console_code: { info: "atlas console_code v1", typ: "atlas.console_code" },
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
  /** The device id of the web, signed here (§7 P1): never taken from anywhere else. */
  readonly did: string;
  readonly iat: number;
  readonly exp: number;
}

export interface LoginPayload {
  readonly typ: "atlas.login";
  readonly v: 1;
  readonly flow: "web";
  readonly iat: number;
  readonly exp: number;
  readonly state: string;
  readonly nonce: string;
  /** The PKCE verifier towards Google. */
  readonly verifier: string;
  /** The device id the web presented at sign-in, if it did (not a credential). */
  readonly did?: string;
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
 * Reads a payload whose MAC was already checked with **this purpose's**
 * subkey: strict JSON, then `typ`, then `v`, then the expiry. A payload of
 * another purpose never gets here (other subkey), and if a broken
 * implementation shared the subkey it would still fail on `typ`: the two
 * barriers of B3, each with its own mutant.
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
      exactKeys(value, ["typ", "v", "sub", "sid", "did", "iat", "exp"]) &&
      isSubject(value.sub) &&
      isId22(value.sid) &&
      isId22(value.did),
  );

export const readLoginPayload = (json: string, nowSeconds: number): PayloadReading<LoginPayload> =>
  readPayload<LoginPayload>(
    json,
    "login",
    nowSeconds,
    (value) =>
      exactKeys(value, ["typ", "v", "flow", "iat", "exp", "state", "nonce", "verifier"], ["did"]) &&
      value.flow === "web" &&
      isId43(value.state) &&
      isId43(value.nonce) &&
      isId43(value.verifier) &&
      (value.did === undefined || isId22(value.did)),
  );

export const sessionPayload = (fields: {
  sub: string;
  sid: string;
  did: string;
  now: number;
  ttlSeconds: number;
}): SessionPayload => ({
  typ: "atlas.session",
  v: 1,
  sub: fields.sub,
  sid: fields.sid,
  did: fields.did,
  iat: fields.now,
  exp: fields.now + fields.ttlSeconds,
});

export const loginPayload = (fields: {
  state: string;
  nonce: string;
  verifier: string;
  did: string | undefined;
  now: number;
  ttlSeconds: number;
}): LoginPayload => ({
  typ: "atlas.login",
  v: 1,
  flow: "web",
  iat: fields.now,
  exp: fields.now + fields.ttlSeconds,
  state: fields.state,
  nonce: fields.nonce,
  verifier: fields.verifier,
  ...(fields.did === undefined ? {} : { did: fields.did }),
});
