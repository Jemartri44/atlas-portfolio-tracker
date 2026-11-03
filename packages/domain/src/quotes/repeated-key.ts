// The refusal of a JSON of `prices/` that repeats a key: the file and the key,
// never the value; the line, for a JSONL. Here, beside the readers of
// `prices/`, and not in `schema/json-keys.ts`, which the boot of the web
// carries.

import { ValidationError } from "../errors.js";
import { repeatedKey } from "../schema/json-keys.js";

export const repeatedKeyError = (file: string, key: string, line?: number): ValidationError =>
  new ValidationError("json_key_repeated", `${file} repeats a key`, {
    file,
    ...(line === undefined ? {} : { line }),
    key,
  });

/**
 * The JSON of a file of `prices/`: refused when it does not parse (with the error of the caller,
 * which says it in its own code) and then when it repeats a key. Never the value.
 */
export const parseStrictJson = (
  text: string,
  file: string,
  syntaxError: () => Error,
  line?: number,
): unknown => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw syntaxError();
  }
  const repeated = repeatedKey(text);
  if (repeated !== undefined) {
    throw repeatedKeyError(file, repeated, line);
  }
  return raw;
};
