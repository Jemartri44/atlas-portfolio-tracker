import { describe, expect, it } from "vitest";
import {
  assertKnownFlags,
  booleanFlag,
  parseArgs,
  requireFlag,
  stringFlag,
  UsageError,
} from "../src/args.js";

describe("parseArgs", () => {
  it("separates positionals from flags in every accepted form", () => {
    const parsed = parseArgs([
      "add",
      "buy",
      "--quantity",
      "10",
      "--fee=1.5",
      "--yes",
      "--notes",
      "--",
      "--literal",
    ]);
    expect(parsed.positionals).toEqual(["add", "buy", "--literal"]);
    expect([...parsed.flags]).toEqual([
      ["quantity", "10"],
      ["fee", "1.5"],
      ["yes", true],
      ["notes", true],
    ]);
  });

  it("rejects malformed options and enforces value/boolean use", () => {
    expect(() => parseArgs(["---x"])).toThrow(UsageError);
    const flags = parseArgs(["--a", "1", "--b"]).flags;
    expect(stringFlag(flags, "a")).toBe("1");
    expect(stringFlag(flags, "missing")).toBeUndefined();
    expect(() => stringFlag(flags, "b")).toThrow(UsageError);
    expect(() => requireFlag(flags, "missing")).toThrow(UsageError);
    expect(requireFlag(flags, "a")).toBe("1");
    expect(booleanFlag(flags, "b")).toBe(true);
    expect(booleanFlag(flags, "missing")).toBe(false);
    expect(() => booleanFlag(flags, "a")).toThrow(UsageError);
    expect(() => assertKnownFlags(flags, ["a"])).toThrow(UsageError);
    expect(() => assertKnownFlags(flags, ["a", "b"])).not.toThrow();
  });
});
