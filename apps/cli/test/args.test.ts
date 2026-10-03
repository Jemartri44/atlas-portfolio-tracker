import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertKnownFlags,
  BOOLEAN_FLAGS,
  booleanFlag,
  ID_FLAGS,
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
 * A device id is 22 characters of base64url and may begin with `-`: one in
 * 4,096 begins with `--`, and `atlas admin forget-device <id>` read it as an
 * option and left with 64 (the intermittent failure of the admin tests).
 */
describe("parseArgs: a value that begins with a dash", () => {
  const ids = ["--Kq3Zp0aX9c-LmN4rT7uVw", "-Kq3Zp0aX9c-LmN4rT7uVw_", "---q3Zp0aX9c-LmN4rT7uV"];

  it("is a positional after `--`, which ends the options, and after `--` nothing is a flag", () => {
    for (const id of ids) {
      const parsed = parseArgs(["admin", "forget-device", "--env", "test", "--", id, "--force"]);
      expect(parsed.positionals).toEqual(["admin", "forget-device", id, "--force"]);
      expect([...parsed.flags]).toEqual([["env", "test"]]);
    }
  });

  it("is a positional when it begins with a single dash, even with no `--`", () => {
    const id = ids[1] as string;
    expect(parseArgs(["admin", "forget-device", id, "--env", "test"]).positionals).toEqual([
      "admin",
      "forget-device",
      id,
    ]);
  });

  it("is the value of a flag of an id, which always takes the next word", () => {
    for (const id of ids) {
      for (const flag of ID_FLAGS) {
        const parsed = parseArgs(["remote", "logout", `--${flag}`, id, "--local-only"]);
        expect(parsed.positionals).toEqual(["remote", "logout"]);
        expect(parsed.flags.get(flag)).toBe(id);
        expect(parsed.flags.get("local-only")).toBe(true);
      }
    }
    // With nothing after it, it still asks for its value.
    expect(() => stringFlag(parseArgs(["remote", "logout", "--device"]).flags, "device")).toThrow(
      "--device necesita un valor",
    );
  });

  it("names the flags of an id, none of them a flag with no value", () => {
    expect([...ID_FLAGS]).toEqual(["device"]);
    expect([...ID_FLAGS].filter((flag) => BOOLEAN_FLAGS.has(flag))).toEqual([]);
  });

  it("read as an unknown option, says to write it after `--`", () => {
    const flags = parseArgs(["admin", "forget-device", ids[0] as string, "--env", "test"]).flags;
    expect(() => assertKnownFlags(flags, ["env"])).toThrow(
      "opción desconocida: --Kq3Zp0aX9c-LmN4rT7uVw. Si es un valor que empieza por guion, como un identificador, escríbelo detrás de «--», que termina las opciones: atlas … -- <valor>",
    );
    expect(() => parseArgs(["admin", "forget-device", ids[2] as string])).toThrow(
      "opción no válida: ---q3Zp0aX9c-LmN4rT7uV. Si es un valor que empieza por guion, como un identificador, escríbelo detrás de «--», que termina las opciones: atlas … -- <valor>",
    );
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
