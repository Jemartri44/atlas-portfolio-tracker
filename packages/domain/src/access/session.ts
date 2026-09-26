// What the SPA learns of its session (`GET /api/session`, decisions P8 (a) and
// B5): the cookie is `HttpOnly`, so this is how it knows it is signed in and
// **which device id the API assigned it** — the one signed in the cookie,
// never another.

import { instantOf, isId22 } from "./ids.js";
import type { SessionPayload } from "./signed.js";

export interface SessionView {
  readonly signed_in: true;
  readonly expires_at: string;
  readonly device_id: string;
}

export const sessionView = (session: SessionPayload): SessionView => ({
  signed_in: true,
  expires_at: instantOf(session.exp),
  device_id: session.did,
});

/** Where a request of the browser comes from, as it says it (`Sec-Fetch-Site`, `Origin`). */
export interface RequestSite {
  readonly secFetchSite: string | undefined;
  readonly origin: string | undefined;
  readonly self: string;
}

/**
 * Whether a request comes **from our own site**: the browser says
 * `Sec-Fetch-Site: same-origin`, or `Origin` is ours. Anything else — another
 * site, or nothing to tell by — is not (S2 of the review of PR #90).
 */
export const fromOwnSite = (site: RequestSite): boolean =>
  site.secFetchSite === "same-origin" || site.origin === site.self;

/**
 * The device id a web presents at sign-in (`?device_id=`): a wish, not a
 * credential. It is taken into account **only when the sign-in starts from
 * our own site**; started from another site, it is ignored and the sign-in
 * goes on without it (a new device), so no page can bind a session to an id
 * of its choosing.
 */
export const presentedDeviceId = (
  query: string | undefined,
  site: RequestSite,
): string | undefined => (isId22(query) && fromOwnSite(site) ? query : undefined);
