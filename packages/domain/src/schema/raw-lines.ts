// Reading and writing the lines of a ledger file as they are (data-schema.md
// §5; ADR-0026, Part A, amendment).
//
// `decodeLines` is what every store does on load: each line decoded with the
// store's schema, a newer version aborting everything (`schema_too_new`) and
// any other refusal relabelled with the line it happened on.
//
// `rawLinesText` is the check the raw-line operations of `LedgerStore` run
// before writing a byte: a store that accepts bytes it later cannot load
// leaves the ledger unreadable. So every line is decoded exactly as the loader
// will decode it, and a line holding a line break is refused on its own:
// `"\n"` would split it in two, and `"\r"` is what `docs/api.md` §5.2 refuses
// too.

import { ValidationError } from "../errors.js";
import type { LedgerEvent } from "./events.js";
import { decodeLine } from "./line.js";
import type { LedgerSchema } from "./migrations/index.js";

/** The events of `lines`, in order, or the loader's error with the line it happened on. */
export const decodeLines = (lines: readonly string[], schema: LedgerSchema): LedgerEvent[] =>
  lines.map((line, index) => {
    try {
      return decodeLine(line, schema).event;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(error.code, `line ${index + 1}: ${error.message}`, {
          ...error.details,
          line: index + 1,
        });
      }
      throw error;
    }
  });

/** The text the lines make once written, or the error of the first that the loader would refuse. */
export const rawLinesText = (lines: readonly string[], schema: LedgerSchema): string => {
  lines.forEach((line, index) => {
    if (/[\n\r]/.test(line)) {
      throw new ValidationError("raw_line_break", `line ${index + 1} holds a line break`, {
        line: index + 1,
      });
    }
  });
  decodeLines(lines, schema);
  return lines.map((line) => `${line}\n`).join("");
};
