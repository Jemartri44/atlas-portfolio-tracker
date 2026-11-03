// What the SPA learns of its session (`GET /api/session`): the cookie is
// `HttpOnly`, so this is how it knows it is signed in and until when.
//
// And the mark that closes every session at once (`POST /api/auth/logout-all`):
// `access/sessions-valid-from.json`, `{"sessions_valid_from_format":1,"at":<seconds>}`,
// written with the clock of the API only. A cookie issued **strictly before** it
// is refused; one issued in the same second or later is not, so the sign-in
// that follows the closing is good at once.

import { repeatsKey } from "../schema/json-keys.js";
import { instantOf } from "./ids.js";
import type { SessionPayload } from "./signed.js";

export interface SessionView {
  readonly signed_in: true;
  readonly expires_at: string;
}

export const sessionView = (session: SessionPayload): SessionView => ({
  signed_in: true,
  expires_at: instantOf(session.exp),
});

export const SESSIONS_VALID_FROM_KEY = "access/sessions-valid-from.json";

/** The mark, in seconds since the epoch; an object that does not read strictly is `unreadable`. */
export const parseSessionsValidFrom = (text: string): number | "unreadable" => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "unreadable";
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    repeatsKey(text) ||
    Object.keys(value).sort().join(",") !== "at,sessions_valid_from_format"
  ) {
    return "unreadable";
  }
  const record = value as { sessions_valid_from_format: unknown; at: unknown };
  return record.sessions_valid_from_format === 1 &&
    typeof record.at === "number" &&
    Number.isSafeInteger(record.at) &&
    record.at >= 0
    ? record.at
    : "unreadable";
};

export const serializeSessionsValidFrom = (seconds: number): string =>
  `${JSON.stringify({ sessions_valid_from_format: 1, at: seconds })}\n`;

/**
 * Whether a session issued at `iat` was closed by the mark. No mark: none was.
 * An unreadable mark closes every session — it can only come from a write that
 * meant to close them, and failing open would undo it.
 */
export const closedByMark = (iat: number, mark: number | "unreadable" | undefined): boolean =>
  mark !== undefined && (mark === "unreadable" || iat < mark);
