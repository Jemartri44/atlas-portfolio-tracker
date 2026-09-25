// Which route admits which credential (`docs/api.md` §2.3), decided here and
// nowhere else: the handler only matches the path and asks. E1 has the routes
// of the access of the web; E2 and E3 add theirs to the same table.

import { type ApiRefusal, refusal } from "./codes.js";
import type { Presented } from "./cookies.js";

/**
 * - `public`: no credential is looked at (the start of a sign-in replaces
 *   whatever session there was).
 * - `login_return`: only the transient cookie of the attempt counts.
 * - `session`: the cookie of the session and nothing else.
 * - `logout`: the cookie is **deleted without being checked**, so none is
 *   required; a token is not a session to close.
 */
export type RoutePolicy = "public" | "login_return" | "session" | "logout";

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
];

/** The route for a method and a path, exact: no prefix, no trailing slash, no case folding. */
export const findRoute = (method: string, path: string): RouteSpec | undefined =>
  ROUTES.find((route) => route.method === method && route.path === path);

export type Admission =
  | { readonly kind: "anonymous" }
  | { readonly kind: "session"; readonly value: string }
  /** `logout` with a cookie: it is cleared, never read. */
  | { readonly kind: "clear_session" }
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
