// The date of the last web sign-in in the bucket (feature 016, §8.1 P6;
// `@atlas/domain/access`, `web-sign-in.ts`): read by the mail, moved forward
// by the API after each web sign-in, **never back**. Conditional, as every
// write of the bucket: `If-Match` on what was read, `If-None-Match: *` when
// there was nothing. A conflict writes nothing and is said; the caller decides.

import {
  advancesWebSignIn,
  parseWebSignIn,
  serializeWebSignIn,
  WEB_SIGN_IN_KEY,
} from "@atlas/domain/access";
import type { ObjectStore } from "./object-store.js";

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const decoded = (bytes: Uint8Array): string | undefined => {
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
};

export const readWebSignIn = async (
  objects: ObjectStore,
): Promise<{ date: string | "unreadable" | undefined; etag?: string }> => {
  const stored = await objects.get(WEB_SIGN_IN_KEY);
  if (stored === undefined) {
    return { date: undefined };
  }
  const text = decoded(stored.body);
  return { date: text === undefined ? "unreadable" : parseWebSignIn(text), etag: stored.etag };
};

export type WebSignInWrite = "written" | "unchanged" | "conflict";

/** Moves the date forward to `date` (of Madrid), or leaves it when it is not earlier. */
export const recordWebSignIn = async (
  objects: ObjectStore,
  date: string,
): Promise<WebSignInWrite> => {
  const stored = await readWebSignIn(objects);
  if (!advancesWebSignIn(stored.date, date)) {
    return "unchanged";
  }
  const body = new TextEncoder().encode(serializeWebSignIn(date));
  const done =
    stored.etag === undefined
      ? (await objects.putIfNoneMatch(WEB_SIGN_IN_KEY, body)) === "created"
      : (await objects.putIfMatch(WEB_SIGN_IN_KEY, body, stored.etag)) === "written";
  return done ? "written" : "conflict";
};
