// What the SPA learns of its session (`GET /api/session`, decisions P8 (a) and
// B5): the cookie is `HttpOnly`, so this is how it knows it is signed in and
// **which device id the API assigned it** — the one signed in the cookie,
// never another.

import { instantOf } from "./ids.js";
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

/** The device id a web presents at sign-in (`?device_id=`): a wish, kept only if well formed. */
export const presentedDeviceId = (query: string | undefined): string | undefined =>
  query !== undefined && /^[A-Za-z0-9_-]{22}$/.test(query) ? query : undefined;
