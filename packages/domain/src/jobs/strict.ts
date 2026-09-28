// Reading what comes from outside the jobs, strictly (feature 016, §5 family 7):
// a plain object — never an array, never something with a prototype through
// which `__proto__` or `toString` would be found — with exactly the keys it
// may have; JSON text with a repeated key or a lone surrogate is refused, as
// `JSON.parse` would keep the last of two equal keys without a word.

import { holdsLoneSurrogate, repeatsKey } from "../schema/json-keys.js";

export type Plain = Record<string, unknown>;

export const isPlainObject = (value: unknown): value is Plain =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Whether `value` has every key of `required`, and no key outside `required` and `optional`. */
export const hasKeys = (
  value: Plain,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean =>
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every((key) => required.includes(key) || optional.includes(key));

/** A JSON object from its text, or nothing: not JSON, a repeated key, a lone surrogate, not an object. */
export const strictJsonObject = (text: string): Plain | undefined => {
  if (holdsLoneSurrogate(text)) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  return isPlainObject(value) && !repeatsKey(text) ? value : undefined;
};

/** An instant as the jobs write it: ISO 8601 UTC, with or without milliseconds. */
export const isInstantText = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) &&
  !Number.isNaN(Date.parse(value));

/** A count: a whole number from 0 to a billion. */
export const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000_000;

/** A code of ours: lower case, digits and `_`. */
export const CODE_SHAPE = /^[a-z][a-z0-9_]{0,63}$/;
