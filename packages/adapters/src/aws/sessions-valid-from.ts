// The mark that closes every session at once (`@atlas/domain/access`, `session.ts`), in the
// bucket: read on every request with a cookie, written by `POST /api/auth/logout-all` with the
// clock of the API. **It only moves forward**, conditionally as every write of the bucket: a mark
// already at or past `seconds` is left as it is.

import {
  parseSessionsValidFrom,
  SESSIONS_VALID_FROM_KEY,
  serializeSessionsValidFrom,
} from "@atlas/domain/access";
import { utf8TextOrUndefined } from "../utf8.js";
import type { ObjectStore } from "./object-store.js";

/** How many times a write lost to another one is tried again before failing. */
const ATTEMPTS = 3;

const readMark = async (
  objects: ObjectStore,
): Promise<{ mark: number | "unreadable" | undefined; etag?: string }> => {
  const stored = await objects.get(SESSIONS_VALID_FROM_KEY);
  if (stored === undefined) {
    return { mark: undefined };
  }
  const text = utf8TextOrUndefined(stored.body, true);
  return {
    mark: text === undefined ? "unreadable" : parseSessionsValidFrom(text),
    etag: stored.etag,
  };
};

export const readSessionsValidFrom = async (
  objects: ObjectStore,
): Promise<number | "unreadable" | undefined> => (await readMark(objects)).mark;

/** Moves the mark to `seconds`; an unreadable one is replaced, since the new mark is a fact. */
export const closeSessionsBefore = async (objects: ObjectStore, seconds: number): Promise<void> => {
  const body = new TextEncoder().encode(serializeSessionsValidFrom(seconds));
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const stored = await readMark(objects);
    if (typeof stored.mark === "number" && stored.mark >= seconds) {
      return;
    }
    const done =
      stored.etag === undefined
        ? (await objects.putIfNoneMatch(SESSIONS_VALID_FROM_KEY, body)) === "created"
        : (await objects.putIfMatch(SESSIONS_VALID_FROM_KEY, body, stored.etag)) === "written";
    if (done) {
      return;
    }
  }
  throw new Error("sessions mark contention");
};
