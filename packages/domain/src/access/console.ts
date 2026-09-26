// The sign-in of the console (ADR-0033; `docs/api.md` §4.1 to §4.3): what
// `GET /api/auth/console/start` accepts, the name of a device, where the
// return goes on the loopback, the body of the exchange, the entry of the
// allow list a code's `sub` stands for, and whether a device may be reissued.

import { isRecord } from "../guards.js";
import type { AllowEntry } from "./allow-list.js";
import { type ApiRefusal, refusal } from "./codes.js";
import type { DeviceObject } from "./device.js";
import { isId22, isId43 } from "./ids.js";

/**
 * The name of a device (decided on 2026-09-25, contracts §B): 1 to 40 code
 * points **in NFC**, of a closed Latin alphabet, the space, `.`, `_` and `-`,
 * with no space at either end and never two together. It is what the user
 * confirms on the manual page and on the reissue page: an open alphabet
 * admits characters that pass for others.
 */
export const isDeviceName = (value: unknown): value is string =>
  typeof value === "string" &&
  value.normalize("NFC") === value &&
  /^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ._-](?:[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ._-]| (?! ))*$/u.test(value) &&
  !value.endsWith(" ") &&
  [...value].length <= 40;

export type ConsoleMode = "loopback" | "manual";

export interface ConsoleStart {
  readonly mode: ConsoleMode;
  /** The port the console opened on `127.0.0.1`; absent only in `manual`. */
  readonly port?: number;
  /** The console's own `state`, which the return carries back to it. */
  readonly state: string;
  readonly code_challenge: string;
  readonly device_name: string;
  /** Only to reissue for a device without a credential (§4.3, N5). */
  readonly reissue_device_id?: string;
}

const START_PARAMETERS: readonly string[] = [
  "mode",
  "port",
  "state",
  "code_challenge",
  "code_challenge_method",
  "device_name",
  "reissue_device_id",
];

const startRefusal = (parameter: string): ApiRefusal =>
  refusal("console_start_invalid", { parameter });

/** A port the console can have opened: 1024 to 65535, written in plain decimal. */
export const isLoopbackPort = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1024 && value <= 65535;

/**
 * The query of `GET /api/auth/console/start`, **each failure with the name of
 * its parameter** (`400 console_start_invalid`). A parameter given twice, or
 * one this route does not know, is refused as well: nothing is guessed.
 */
export const parseConsoleStart = (
  params: readonly (readonly [string, string])[],
): ConsoleStart | ApiRefusal => {
  const seen = new Map<string, string>();
  for (const [name, value] of params) {
    if (!START_PARAMETERS.includes(name) || seen.has(name)) {
      return startRefusal(name);
    }
    seen.set(name, value);
  }
  const mode = seen.get("mode") ?? "loopback";
  if (mode !== "loopback" && mode !== "manual") {
    return startRefusal("mode");
  }
  const portText = seen.get("port");
  const port = portText !== undefined && /^[1-9]\d{3,4}$/.test(portText) ? Number(portText) : NaN;
  if ((portText !== undefined || mode === "loopback") && !isLoopbackPort(port)) {
    return startRefusal("port");
  }
  const state = seen.get("state");
  if (!isId43(state)) {
    return startRefusal("state");
  }
  const challenge = seen.get("code_challenge");
  if (!isId43(challenge)) {
    return startRefusal("code_challenge");
  }
  if (seen.get("code_challenge_method") !== "S256") {
    return startRefusal("code_challenge_method");
  }
  const name = seen.get("device_name");
  if (!isDeviceName(name)) {
    return startRefusal("device_name");
  }
  const reissue = seen.get("reissue_device_id");
  if (reissue !== undefined && !isId22(reissue)) {
    return startRefusal("reissue_device_id");
  }
  return {
    mode,
    ...(portText === undefined ? {} : { port }),
    state,
    code_challenge: challenge,
    device_name: name,
    ...(reissue === undefined ? {} : { reissue_device_id: reissue }),
  };
};

/**
 * Where the loopback return goes: **the literal `127.0.0.1`**, written here,
 * and the port validated at the start — never a host of anybody's choosing,
 * never `localhost` (ADR-0033, point 4; mutant 20).
 */
export const loopbackCallback = (port: number, code: string, state: string): string => {
  // Both are base64url (the signed code, the console's `state`): nothing to
  // encode, and anything else never reaches a URL.
  if (!isLoopbackPort(port) || !/^[A-Za-z0-9_.-]{1,8192}$/.test(code) || !isId43(state)) {
    throw new RangeError("a loopback return is a port of 1024 to 65535, a code and a state");
  }
  return `http://127.0.0.1:${port}/callback?code=${code}&state=${state}`;
};

/** A PKCE verifier (RFC 7636, §4.1): 43 to 128 unreserved characters. */
export const isPkceVerifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(value);

/** `{ "code", "code_verifier" }` and nothing else (§4.3): the device is never the client's. */
export const parseExchangeBody = (
  value: unknown,
): { readonly code: string; readonly code_verifier: string } | ApiRefusal => {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== "code" && key !== "code_verifier")
  ) {
    return refusal("body_invalid", { reason: "fields" });
  }
  if (typeof value.code !== "string" || value.code.length === 0 || value.code.length > 8192) {
    return refusal("body_invalid", { reason: "code" });
  }
  if (!isPkceVerifier(value.code_verifier)) {
    return refusal("body_invalid", { reason: "code_verifier" });
  }
  return { code: value.code, code_verifier: value.code_verifier };
};

/**
 * The entry of the allow list a code's `sub` stands for (Q8 (a)): the code
 * carries no e-mail, so the exchange takes it from the one entry of that
 * `sub` and checks the pair whole. Two entries for one `sub` choose nothing.
 */
export const entryForSubject = (
  entries: readonly AllowEntry[],
  sub: string,
): AllowEntry | "missing" | "ambiguous" => {
  const found = entries.filter((entry) => entry.sub === sub);
  if (found.length === 0) {
    return "missing";
  }
  return found.length === 1 ? (found[0] as AllowEntry) : "ambiguous";
};

export type ReissueRefusal =
  | "reissue_device_missing"
  | "reissue_device_forgotten"
  | "reissue_device_not_console"
  | "reissue_device_unreadable";

/**
 * Whether a device may be reissued (N5; R2-B1): **it exists, it is not
 * forgotten and it is a console**. Each failure with its own code; none is
 * folded into another.
 */
export const reissueRefusal = (
  read: DeviceObject | "unreadable" | undefined,
): ReissueRefusal | undefined => {
  if (read === undefined) {
    return "reissue_device_missing";
  }
  if (read === "unreadable") {
    return "reissue_device_unreadable";
  }
  if (read.type !== "console") {
    return "reissue_device_not_console";
  }
  return read.state === "active" ? undefined : "reissue_device_forgotten";
};
