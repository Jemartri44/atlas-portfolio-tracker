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
import { type ConsoleStart, isDeviceName, isLoopbackPort } from "./console.js";
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
  /** Who opened the attempt: the web, or `atlas remote login` (E2). */
  readonly flow: "web" | "console";
  readonly iat: number;
  readonly exp: number;
  readonly state: string;
  readonly nonce: string;
  /** The PKCE verifier towards Google. */
  readonly verifier: string;
  /** The device id the web presented at sign-in, if it did (not a credential). Web only. */
  readonly did?: string;
  /** What the console asked at `console/start` (`docs/api.md` §4.1). Console only. */
  readonly console?: ConsoleStart;
}

/**
 * The one-time code of the console (`data-model.md` §1.4), signed with the
 * subkey `console_code` and its `typ`: the `token_id` the token will have, the
 * `code_challenge` of the console, the `sub` — **no e-mail** (Q8 (a)) —, the
 * name, and the device to reissue, if it is a reissue.
 */
export interface ConsoleCodePayload {
  readonly typ: "atlas.console_code";
  readonly v: 1;
  readonly tid: string;
  readonly cc: string;
  readonly sub: string;
  readonly dn: string;
  readonly rdid?: string;
  readonly iat: number;
  readonly exp: number;
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

/** What the console asked, as it travels in the attempt: the same rules as `parseConsoleStart`. */
const isConsoleStart = (value: unknown): boolean =>
  isRecord(value) &&
  exactKeys(
    value,
    ["mode", "state", "code_challenge", "device_name"],
    ["port", "reissue_device_id"],
  ) &&
  (value.mode === "manual" || (value.mode === "loopback" && value.port !== undefined)) &&
  (value.port === undefined || isLoopbackPort(value.port)) &&
  isId43(value.state) &&
  isId43(value.code_challenge) &&
  isDeviceName(value.device_name) &&
  (value.reissue_device_id === undefined || isId22(value.reissue_device_id));

export const readLoginPayload = (json: string, nowSeconds: number): PayloadReading<LoginPayload> =>
  readPayload<LoginPayload>(
    json,
    "login",
    nowSeconds,
    (value) =>
      exactKeys(
        value,
        ["typ", "v", "flow", "iat", "exp", "state", "nonce", "verifier"],
        ["did", "console"],
      ) &&
      // A web attempt never carries the console's, nor the console's a device of the web.
      ((value.flow === "web" && value.console === undefined) ||
        (value.flow === "console" && value.did === undefined && isConsoleStart(value.console))) &&
      isId43(value.state) &&
      isId43(value.nonce) &&
      isId43(value.verifier) &&
      (value.did === undefined || isId22(value.did)),
  );

export const readConsoleCodePayload = (
  json: string,
  nowSeconds: number,
): PayloadReading<ConsoleCodePayload> =>
  readPayload<ConsoleCodePayload>(
    json,
    "console_code",
    nowSeconds,
    (value) =>
      exactKeys(value, ["typ", "v", "tid", "cc", "sub", "dn", "iat", "exp"], ["rdid"]) &&
      isId22(value.tid) &&
      isId43(value.cc) &&
      isSubject(value.sub) &&
      isDeviceName(value.dn) &&
      (value.rdid === undefined || isId22(value.rdid)),
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

/** The attempt of the console: the Lambda's own `state`, `nonce` and verifier, and what the console asked. */
export const consoleLoginPayload = (fields: {
  state: string;
  nonce: string;
  verifier: string;
  console: ConsoleStart;
  now: number;
  ttlSeconds: number;
}): LoginPayload => ({
  typ: "atlas.login",
  v: 1,
  flow: "console",
  iat: fields.now,
  exp: fields.now + fields.ttlSeconds,
  state: fields.state,
  nonce: fields.nonce,
  verifier: fields.verifier,
  console: fields.console,
});

export const consoleCodePayload = (fields: {
  tokenId: string;
  codeChallenge: string;
  sub: string;
  deviceName: string;
  reissueDeviceId: string | undefined;
  now: number;
  ttlSeconds: number;
}): ConsoleCodePayload => ({
  typ: "atlas.console_code",
  v: 1,
  tid: fields.tokenId,
  cc: fields.codeChallenge,
  sub: fields.sub,
  dn: fields.deviceName,
  ...(fields.reissueDeviceId === undefined ? {} : { rdid: fields.reissueDeviceId }),
  iat: fields.now,
  exp: fields.now + fields.ttlSeconds,
});
