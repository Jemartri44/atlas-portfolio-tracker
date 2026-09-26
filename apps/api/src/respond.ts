// The answers of the API: JSON with the shape of `docs/api.md` §7, the pages
// of §3.1, redirects only where the sign-in needs them, and the cookies with
// the attributes ADR-0027 fixes. Nothing here is stored by any cache.

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
