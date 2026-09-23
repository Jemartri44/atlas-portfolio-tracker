import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertKnownFlags,
  BOOLEAN_FLAGS,
  booleanFlag,
  parseArgs,
  REPEATABLE_FLAGS,
  requireFlag,
  stringFlag,
  UsageError,
} from "../src/args.js";
import { USAGE } from "../src/main.js";

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

describe("parseArgs: a boolean flag given a yes or a no", () => {
  it("is refused, and says how the flag is written, instead of being read", () => {
    for (const word of ["true", "false", "sí", "si", "no", "0", "1", "FALSE", "No"]) {
      expect(() => parseArgs(["asset", "add", "--transferable", word])).toThrow(
        `--transferable no lleva valor («${word}»): pon --transferable para sí y --not-transferable para no`,
      );
    }
    expect(() => parseArgs(["tax", "2027", "--json", "false"])).toThrow(
      "--json no lleva valor («false»): pon --json para sí; omítela para no",
    );
    // A flag that takes a value takes it, whatever it says.
    expect(parseArgs(["add", "fee", "--notes", "no"]).flags.get("notes")).toBe("no");
  });
});

/**
 * A way out that is not in the help is a way out nobody finds the day it is
 * needed: `compact` offered `--accept-unverified` and the usage line said only
 * `compact [--yes]` (second review of feature 011). A flag that can be given
 * several times is always a deliberate one, so each of them has to be named.
 */
describe("the usage line", () => {
  it("names every repeatable flag, and compact names its way out", () => {
    for (const flag of REPEATABLE_FLAGS) {
      expect(USAGE, `--${flag}`).toContain(`--${flag}`);
    }
    expect(USAGE).toContain("compact [--yes] [--accept-unverified <id>]…");
  });
});
