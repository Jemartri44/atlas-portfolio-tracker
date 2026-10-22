// The answers of the API: JSON with the shape of `docs/api.md` §7, the pages
// of §3.1, redirects only where the sign-in needs them, and the cookies with
// the attributes ADR-0027 fixes. Nothing here is stored by any cache.

import { gzipSync } from "node:zlib";
import { decodeUtf8Strict } from "@atlas/adapters/aws";
import { type ApiRefusal, LOGIN_COOKIE, SESSION_COOKIE } from "@atlas/domain/access";
import type { FunctionUrlResult } from "./event.js";

const base = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export const json = (
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
): FunctionUrlResult => ({
  statusCode: status,
  headers: { ...base, "content-type": "application/json; charset=utf-8", ...extra },
  body: JSON.stringify(body),
  isBase64Encoded: false,
});

/** `{ "error": { "code", "details" } }`, never a sentence: the interfaces translate the code. */
export const refused = (refusal: ApiRefusal): FunctionUrlResult =>
  json(
    refusal.status,
    { error: { code: refusal.code, details: refusal.details } },
    refusal.code === "remote_unavailable" ? { "retry-after": "5" } : {},
  );

export const noContent = (cookies: string[] = []): FunctionUrlResult => ({
  statusCode: 204,
  headers: { ...base },
  cookies,
  body: "",
  isBase64Encoded: false,
});

export const redirect = (location: string, cookies: string[]): FunctionUrlResult => ({
  statusCode: 302,
  headers: { ...base, location, "referrer-policy": "no-referrer" },
  cookies,
  body: "",
  isBase64Encoded: false,
});

export const page = (
  status: number,
  html: string,
  cookies: string[],
  csp: string,
  extra: Record<string, string> = {},
): FunctionUrlResult => ({
  statusCode: status,
  headers: {
    ...extra,
    ...base,
    "content-type": "text/html; charset=utf-8",
    "referrer-policy": "no-referrer",
    "content-security-policy": csp,
  },
  cookies,
  body: html,
  isBase64Encoded: false,
});

/** `__Host-`: `Secure`, `Path=/` and no `Domain` (RFC 6265bis, §4.1.3.2). */
export const sessionCookie = (value: string, maxAge: number): string =>
  `${SESSION_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;

/** `Lax`: the return from Google is a navigation from another site, and `Strict` would not travel. */
export const loginCookie = (value: string, maxAge: number): string =>
  `${LOGIN_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

export const clearSessionCookie = (): string => sessionCookie("", 0);
export const clearLoginCookie = (): string => loginCookie("", 0);

/**
 * The exact bytes of a file (block 0 of E3, questions.md §23.4): as text when
 * they are UTF-8, which writes them back identical, and in base64 otherwise.
 * Nothing in between can change one byte.
 */
export const bytes = (
  status: number,
  body: Uint8Array,
  headers: Record<string, string>,
): FunctionUrlResult => {
  let text: string | undefined;
  try {
    text = decodeUtf8Strict(body, true);
  } catch {
    text = undefined;
  }
  return {
    statusCode: status,
    headers: { ...base, ...headers },
    body: text ?? Buffer.from(body).toString("base64"),
    isBase64Encoded: text === undefined,
  };
};

/** The size from which a file is worth compressing: the histories of the ECB are megabytes, the rest bytes. */
const GZIP_FROM_BYTES = 256 * 1024;

/**
 * `bytes`, compressed when the client accepts it and the file is large. The Function URL
 * answers at most 6 MB (base64 included) and `api-exr.csv` weighs some 12 MB; gzip leaves it
 * under 2 MB. The caller keeps the same `etag`: it names the file, not its encoding.
 */
export const bytesCompressed = (
  status: number,
  body: Uint8Array,
  headers: Record<string, string>,
  acceptEncoding: string | undefined,
): FunctionUrlResult => {
  if (body.length < GZIP_FROM_BYTES || !/\bgzip\b/i.test(acceptEncoding ?? "")) {
    return bytes(status, body, headers);
  }
  return {
    statusCode: status,
    headers: { ...base, ...headers, "content-encoding": "gzip", vary: "accept-encoding" },
    body: gzipSync(body).toString("base64"),
    isBase64Encoded: true,
  };
};

/** `304`: the version the client already holds; no body. */
export const notModified = (headers: Record<string, string>): FunctionUrlResult => ({
  statusCode: 304,
  headers: { ...base, ...headers },
  body: "",
  isBase64Encoded: false,
});
