// Which route admits which credential (`docs/api.md` §2.3), decided here and
// nowhere else: the handler only matches the path and asks.

import { type ApiRefusal, refusal } from "./codes.js";
import type { Presented } from "./cookies.js";

/**
 * - `public`: no credential is looked at (the start of a sign-in replaces
 *   whatever session there was).
 * - `login_return`: only the transient cookie of the attempt counts.
 * - `session`: the cookie of the session and nothing else; a write checks
 *   `Origin`.
 * - `logout`: the cookie is **deleted without being checked**, so none is
 *   required.
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
  { method: "POST", path: "/api/auth/logout-all", policy: "session", writes: true },
  { method: "GET", path: "/api/session", policy: "session", writes: false },
  // The ledger (`docs/api.md` §5) and the reference data.
  { method: "GET", path: "/api/ledger", policy: "session", writes: false },
  { method: "POST", path: "/api/ledger/lines", policy: "session", writes: true },
  { method: "GET", path: "/api/reference/index", policy: "session", writes: false },
  { method: "GET", path: "/api/reference/ecb/{name}", policy: "session", writes: false },
  { method: "GET", path: "/api/reference/prices/{name}", policy: "session", writes: false },
  // The drafts in the cloud (`docs/api.md` §6.1).
  { method: "GET", path: "/api/drafts", policy: "session", writes: false },
  { method: "POST", path: "/api/drafts", policy: "session", writes: true },
  { method: "POST", path: "/api/drafts/{id}/stamp", policy: "session", writes: true },
  { method: "POST", path: "/api/drafts/{id}/end", policy: "session", writes: true },
  // The exposure the owner declares per asset (`docs/api.md` §6.2).
  { method: "GET", path: "/api/exposure", policy: "session", writes: false },
  { method: "PUT", path: "/api/exposure", policy: "session", writes: true },
  // The assumptions of the projection the owner edited (`docs/api.md` §6.2).
  { method: "GET", path: "/api/projection", policy: "session", writes: false },
  { method: "PUT", path: "/api/projection", policy: "session", writes: true },
  // The last run of each scheduled task (`docs/api.md` §6.3).
  { method: "GET", path: "/api/jobs/status", policy: "session", writes: false },
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
  | { readonly kind: "refused"; readonly refusal: ApiRefusal };

const refused = (value: ApiRefusal): Admission => ({ kind: "refused", refusal: value });

/**
 * Whether a write that comes **with the cookie** is from our own origin
 * (ADR-0027; `docs/api.md` §2). An absent `Origin` is refused as much as a
 * foreign one: the `if (origin && origin !== self)` of always is the bug this
 * exists to prevent.
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
