// Which route admits which credential (`docs/api.md` §2.3), decided here and
// nowhere else: the handler only matches the path and asks. E1 has the routes
// of the access of the web; E2 and E3 add theirs to the same table.

import { type ApiRefusal, refusal } from "./codes.js";
import type { Presented } from "./cookies.js";

/**
 * - `public`: no credential is looked at (the start of a sign-in replaces
 *   whatever session there was).
 * - `console_start`: public too, but **a token opens no attempt** (§2.3:
 *   issuing is only at the end of a sign-in the console opens; mutant 26).
 * - `login_return`: only the transient cookie of the attempt counts.
 * - `session`: the cookie of the session and nothing else.
 * - `logout`: the cookie is **deleted without being checked**, so none is
 *   required; a token is not a session to close.
 * - `exchange`: the exchange of §4.3, with no credential or with the previous
 *   token to renew; never with the cookie.
 * - `token`: the token of the console and nothing else.
 */
export type RoutePolicy =
  | "public"
  | "console_start"
  | "login_return"
  | "session"
  | "logout"
  | "exchange"
  | "token";

export interface RouteSpec {
  readonly method: "GET" | "POST" | "PUT";
  readonly path: string;
  readonly policy: RoutePolicy;
  /** A write: JSON body required, and `Origin` checked when it comes with the cookie. */
  readonly writes: boolean;
}

export const ROUTES: readonly RouteSpec[] = [
  { method: "GET", path: "/api/auth/login", policy: "public", writes: false },
  { method: "GET", path: "/api/auth/callback", policy: "login_return", writes: false },
  { method: "POST", path: "/api/auth/logout", policy: "logout", writes: true },
  { method: "GET", path: "/api/session", policy: "session", writes: false },
  // E2, the token of the console (`docs/api.md` §4).
  { method: "GET", path: "/api/auth/console/start", policy: "console_start", writes: false },
  { method: "POST", path: "/api/auth/console/token", policy: "exchange", writes: true },
  { method: "POST", path: "/api/auth/console/revoke", policy: "token", writes: true },
  { method: "GET", path: "/api/devices/tokens", policy: "session", writes: false },
  {
    method: "POST",
    path: "/api/devices/tokens/{token_id}/revoke",
    policy: "session",
    writes: true,
  },
];

/**
 * The route for a method and a path, exact: no prefix, no trailing slash, no
 * case folding. A `{name}` of the table stands for **one** segment, never
 * empty and never with a `/`, and is handed over as it came: whoever uses it
 * validates it before building anything with it.
 */
export const matchRoute = (
  method: string,
  path: string,
): { readonly route: RouteSpec; readonly params: Readonly<Record<string, string>> } | undefined => {
  const segments = path.split("/");
  for (const route of ROUTES) {
    const pattern = route.path.split("/");
    if (route.method !== method || pattern.length !== segments.length) {
      continue;
    }
    const params: Record<string, string> = {};
    const fits = pattern.every((piece, index) => {
      const segment = segments[index] as string;
      if (/^\{[a-z_]+\}$/.test(piece)) {
        params[piece.slice(1, -1)] = segment;
        return segment.length > 0;
      }
      return piece === segment;
    });
    if (fits) {
      return { route, params };
    }
  }
  return undefined;
};

export const findRoute = (method: string, path: string): RouteSpec | undefined =>
  matchRoute(method, path)?.route;

export type Admission =
  | { readonly kind: "anonymous" }
  | { readonly kind: "session"; readonly value: string }
  /** `logout` with a cookie: it is cleared, never read. */
  | { readonly kind: "clear_session" }
  /** The token of the console, **not yet checked**: the handler checks it (§2.2). */
  | { readonly kind: "token"; readonly value: string }
  | { readonly kind: "refused"; readonly refusal: ApiRefusal };

const refused = (value: ApiRefusal): Admission => ({ kind: "refused", refusal: value });

/**
 * Whether a write that comes **with the cookie** is from our own origin
 * (ADR-0027; `docs/api.md` §2). An absent `Origin` is refused as much as a
 * foreign one (N6): the `if (origin && origin !== self)` of always is the
 * mutant this exists to kill.
 */
export const originAccepted = (origin: string | undefined, self: string): boolean =>
  origin === self;

export const admit = (
  route: RouteSpec,
  presented: Presented,
  origin: string | undefined,
  self: string,
): Admission => {
  if (route.policy === "public" || route.policy === "login_return") {
    return { kind: "anonymous" };
  }
  if (presented.kind === "ambiguous") {
    return refused(refusal("credentials_ambiguous"));
  }
  if (route.policy === "console_start") {
    return presented.kind === "token"
      ? refused(refusal("forbidden_for_credential"))
      : { kind: "anonymous" };
  }
  if (route.policy === "exchange" || route.policy === "token") {
    if (presented.kind === "token") {
      return { kind: "token", value: presented.value };
    }
    if (presented.kind === "none") {
      return route.policy === "exchange"
        ? { kind: "anonymous" }
        : refused(refusal("unauthenticated"));
    }
    return refused(refusal("forbidden_for_credential"));
  }
  if (presented.kind === "token") {
    return refused(refusal("forbidden_for_credential"));
  }
  if (presented.kind === "none") {
    return route.policy === "logout" ? { kind: "anonymous" } : refused(refusal("unauthenticated"));
  }
  if (route.writes && !originAccepted(origin, self)) {
    return refused(refusal("origin_rejected"));
  }
  if (route.policy === "logout") {
    return { kind: "clear_session" };
  }
  if (presented.kind === "session_repeated") {
    return refused(refusal("session_invalid", { reason: "repeated" }));
  }
  return { kind: "session", value: presented.value };
};
