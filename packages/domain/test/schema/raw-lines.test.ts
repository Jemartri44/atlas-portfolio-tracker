// The check of the raw-line operations (feature 014, block 1): what the loader
// would refuse is refused before a byte is written.

import { describe, expect, it } from "vitest";
import { SchemaTooNewError, ValidationError } from "../../src/errors.js";
import { encodeLine } from "../../src/schema/line.js";
import { CURRENT_LEDGER_SCHEMA } from "../../src/schema/migrations/index.js";
import { rawLinesText } from "../../src/schema/raw-lines.js";
import { SAMPLES } from "../samples.js";

const buy = encodeLine(SAMPLES.buy);
const sell = encodeLine(SAMPLES.sell);

const failure = (lines: readonly string[]): unknown => {
  try {
    rawLinesText(lines, CURRENT_LEDGER_SCHEMA);
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("rawLinesText", () => {
  it("writes each line exactly as given, followed by a newline", () => {
    const shuffled = ` ${buy.replace('{"schema_version":1,', '{ "schema_version" : 1 ,')}`;
    expect(rawLinesText([shuffled, sell], CURRENT_LEDGER_SCHEMA)).toBe(`${shuffled}\n${sell}\n`);
    expect(rawLinesText([], CURRENT_LEDGER_SCHEMA)).toBe("");
  });

  it("refuses a line holding a lone surrogate: its bytes would not be UTF-8 (review of PR #96, B1)", () => {
    const lone = buy.replace('"source":"manual"', '"source":"manual","note":"a\ud800"');
    const error = failure([sell, lone]);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe("raw_lone_surrogate");
    expect((error as ValidationError).details).toEqual({ line: 2 });
  });

  it("refuses a line holding a newline or a carriage return, with its position", () => {
    for (const broken of [`${buy}\n${sell}`, `${buy}\r`]) {
      const error = failure([sell, broken]) as ValidationError;
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe("raw_line_break");
      expect(error.details).toEqual({ line: 2 });
    }
  });

  it("refuses an unreadable line with the loader's own code and its position", () => {
    const error = failure([buy, "{"]) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe("invalid_json");
    expect(error.message.startsWith("line 2: ")).toBe(true);
    expect(error.details.line).toBe(2);
  });

  it("refuses a line of a newer schema as the loader does", () => {
    const newer = buy.replace('"schema_version":1', '"schema_version":2');
    expect(failure([newer])).toBeInstanceOf(SchemaTooNewError);
  });
});
