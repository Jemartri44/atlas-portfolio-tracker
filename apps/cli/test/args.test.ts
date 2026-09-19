import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertKnownFlags,
  BOOLEAN_FLAGS,
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

describe("parseArgs: a flag that never takes a value never swallows the next word", () => {
  it("reads the global flags in front of the command, as the usage line puts them", () => {
    expect(parseArgs(["--json", "tax", "2027"])).toEqual({
      positionals: ["tax", "2027"],
      flags: new Map([["json", true]]),
    });
    const add = parseArgs(["--yes", "--confirm-duplicate", "asset", "add", "--id", "x"]);
    expect(add.positionals).toEqual(["asset", "add"]);
    expect([...add.flags]).toEqual([
      ["yes", true],
      ["confirm-duplicate", true],
      ["id", "x"],
    ]);
    // A flag that does take a value still takes it in front of the command.
    expect(parseArgs(["--ledger", "l.jsonl", "tax", "2027"]).positionals).toEqual(["tax", "2027"]);
  });

  it("reads them after the command too, and a boolean of a command before a positional", () => {
    expect(parseArgs(["tax", "2027", "--json"]).positionals).toEqual(["tax", "2027"]);
    expect(parseArgs(["tax", "--lots", "2027"]).positionals).toEqual(["tax", "2027"]);
  });

  it("knows every flag the commands read as a boolean", () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "../src");
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
      });
    const read = new Set(
      files(src).flatMap((file) =>
        [...readFileSync(file, "utf8").matchAll(/booleanFlag\(\s*[\w.]+,\s*"([a-z-]+)"/g)].map(
          (match) => match[1] as string,
        ),
      ),
    );
    expect(read.size).toBeGreaterThan(8);
    expect([...read].filter((name) => !BOOLEAN_FLAGS.has(name))).toEqual([]);
  });
});
