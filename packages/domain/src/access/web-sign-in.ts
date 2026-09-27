// The date of the last sign-in of the web (feature 016, §8.1 P6; Q3):
// `access/last-web-sign-in.json`, `{"web_sign_in_format":1,"last_web_sign_in":"YYYY-MM-DD"}`,
// **exactly those two keys** — no `sub`, no mail, no device — with the date of
// `Europe/Madrid`, not the instant: the monthly mail counts days, and an
// instant would say at what time the user signs in, which nobody needs.
// The API writes it after each web sign-in, and **it only moves forward**: an
// equal or earlier date writes nothing. Google counts a pass through it as the
// use of the OAuth client (ADR-0027, «Riesgo»); the console counts by the
// issue of its tokens.

import { type CivilDate, isCivilDate } from "../dates/civil-date.js";
import { repeatsKey } from "../schema/json-keys.js";

export const WEB_SIGN_IN_KEY = "access/last-web-sign-in.json";

export const parseWebSignIn = (text: string): CivilDate | "unreadable" => {
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
    Object.keys(value).sort().join(",") !== "last_web_sign_in,web_sign_in_format"
  ) {
    return "unreadable";
  }
  const record = value as { web_sign_in_format: unknown; last_web_sign_in: unknown };
  return record.web_sign_in_format === 1 && isCivilDate(record.last_web_sign_in)
    ? record.last_web_sign_in
    : "unreadable";
};

export const serializeWebSignIn = (date: CivilDate): string =>
  `${JSON.stringify({ web_sign_in_format: 1, last_web_sign_in: date })}\n`;

/**
 * Whether `next` is written over what is stored: only when it moves forward.
 * An unreadable object is replaced, since the new date is a fact and the old
 * bytes say nothing.
 */
export const advancesWebSignIn = (
  stored: CivilDate | "unreadable" | undefined,
  next: CivilDate,
): boolean => stored === undefined || stored === "unreadable" || next > stored;
