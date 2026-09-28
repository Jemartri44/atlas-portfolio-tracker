// Reading JSON from outside strictly (feature 016, §5 family 7): a plain
// object — never an array, never something with a prototype through which
// `__proto__` or `toString` would be found; JSON text with a repeated key or a
// lone surrogate is refused, as `JSON.parse` would keep the last of two equal
// keys without a word. Shared by the jobs and by the web's reading of the
// manifest of the ECB (E3), so neither reaches the other.

import { holdsLoneSurrogate, repeatsKey } from "./json-keys.js";

export type Plain = Record<string, unknown>;

export const isPlainObject = (value: unknown): value is Plain =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

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
