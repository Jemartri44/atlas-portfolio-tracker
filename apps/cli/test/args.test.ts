import { describe, expect, it } from "vitest";
import {
  assertKnownFlags,
  booleanFlag,
  parseArgs,
  REPEATABLE_FLAGS,
  requireFlag,
  stringFlag,
  UsageError,
} from "../src/args.js";
import { USAGE } from "../src/usage.js";

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
    const flags = parseArgs(["--a", "1", "--json"]).flags;
    expect(stringFlag(flags, "a")).toBe("1");
    expect(stringFlag(flags, "missing")).toBeUndefined();
    expect(() => stringFlag(flags, "json")).toThrow(UsageError);
    expect(() => requireFlag(flags, "missing")).toThrow(UsageError);
    expect(requireFlag(flags, "a")).toBe("1");
    expect(booleanFlag(flags, "json")).toBe(true);
    expect(booleanFlag(flags, "lots")).toBe(false);
    expect(() => booleanFlag(new Map([["lots", "1"]]), "lots")).toThrow(UsageError);
    expect(() => assertKnownFlags(flags, ["a"])).toThrow(UsageError);
    expect(() => assertKnownFlags(flags, ["a", "json"])).not.toThrow();
  });
});

describe("parseArgs: a flag written twice", () => {
  it("is refused when it takes one value, instead of the last one winning in silence", () => {
    for (const argv of [
      ["add", "buy", "--quantity", "1", "--quantity", "2"],
      ["add", "buy", "--quantity=1", "--quantity", "2"],
      ["add", "buy", "--quantity", "1", "--quantity=2"],
    ]) {
      const { flags } = parseArgs(argv);
      expect(() => stringFlag(flags, "quantity")).toThrow("se ha escrito 2 veces");
    }
    expect(() => stringFlag(parseArgs(["--ledger", "a", "--ledger", "b"]).flags, "ledger")).toThrow(
      UsageError,
    );
  });

  it("is still read in order when the flag is repeatable, and harmless for a boolean", () => {
    const { flags } = parseArgs(["--set", "a=1", "--set", "b=2", "--yes", "--yes", "--json"]);
    expect(flags.get("set")).toEqual(["a=1", "b=2"]);
    expect(booleanFlag(flags, "yes")).toBe(true);
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

  it("refuses to read as a boolean a flag the parser does not know as one", () => {
    expect(() => booleanFlag(new Map(), "not-declared")).toThrow("BOOLEAN_FLAGS");
    expect(() => booleanFlag(new Map(), "json")).not.toThrow();
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

/** A positional that begins with a dash: after `--`, which ends the options, POSIX style. */
describe("parseArgs: a value that begins with a dash", () => {
  const ids = ["--Kq3Zp0aX9c-LmN4rT7uVw", "-Kq3Zp0aX9c-LmN4rT7uVw_", "---q3Zp0aX9c-LmN4rT7uV"];

  it("is a positional after `--`, which ends the options, and after `--` nothing is a flag", () => {
    for (const id of ids) {
      const parsed = parseArgs(["lots", "--date", "2026-01-01", "--", id, "--yes"]);
      expect(parsed.positionals).toEqual(["lots", id, "--yes"]);
      expect([...parsed.flags]).toEqual([["date", "2026-01-01"]]);
    }
  });

  it("is a positional when it begins with a single dash, even with no `--`", () => {
    const id = ids[1] as string;
    expect(parseArgs(["lots", id, "--date", "2026-01-01"]).positionals).toEqual(["lots", id]);
  });

  it("read as an unknown option, says to write it after `--`", () => {
    const flags = parseArgs(["lots", ids[0] as string, "--date", "2026-01-01"]).flags;
    expect(() => assertKnownFlags(flags, ["date"])).toThrow(
      "opción desconocida: --Kq3Zp0aX9c-LmN4rT7uVw. Si es un valor que empieza por guion, como un identificador, escríbelo detrás de «--», que termina las opciones: atlas … -- <valor>",
    );
    expect(() => parseArgs(["lots", ids[2] as string])).toThrow(
      "opción no válida: ---q3Zp0aX9c-LmN4rT7uV. Si es un valor que empieza por guion, como un identificador, escríbelo detrás de «--», que termina las opciones: atlas … -- <valor>",
    );
  });
});

/**
 * A way out that is not in the help is a way out nobody finds the day it is needed: `compact`
 * offered `--accept-unverified` and the usage line said only `compact [--yes]`. A flag that can be
 * given several times is always a deliberate one, so each of them has to be named.
 */
describe("the usage line", () => {
  it("names every repeatable flag, and compact names its way out", () => {
    for (const flag of REPEATABLE_FLAGS) {
      expect(USAGE, `--${flag}`).toContain(`--${flag}`);
    }
    expect(USAGE).toContain("compact [--yes] [--accept-unverified <id>]…");
  });
});
