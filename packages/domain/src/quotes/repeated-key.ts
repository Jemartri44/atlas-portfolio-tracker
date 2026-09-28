// The refusal of a JSON of `prices/` that repeats a key (round 2 of the
// review of PR #106, R2-B1): the file and the key, never the value; the line,
// for a JSONL. Here, beside the readers of `prices/`, and not in
// `schema/json-keys.ts`, which the boot of the web carries.

import { ValidationError } from "../errors.js";

export const repeatedKeyError = (file: string, key: string, line?: number): ValidationError =>
  new ValidationError("json_key_repeated", `${file} repeats a key`, {
    file,
    ...(line === undefined ? {} : { line }),
    key,
  });
