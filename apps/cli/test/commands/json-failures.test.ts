// A failed order with `--json` leaves one object on stdout, like every other answer, and the
// sentence on stderr as without it.

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DomainError, type UseCaseDeps } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import type { Io } from "../../src/context.js";
import { run } from "../../src/main.js";
import { reportError } from "../../src/report.js";
import { harness, seed } from "../harness.js";

interface Captured {
  code: number;
  out: string[];
  err: string[];
}

const capture = async (
  argv: string[],
  overrides: Parameters<typeof run>[2] = {},
): Promise<Captured> => {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    confirm: async () => undefined,
  };
  return { code: await run(argv, io, overrides), out, err };
};

const oneObject = (out: string[]): Record<string, unknown> => {
  expect(out).toHaveLength(1);
  return JSON.parse(out[0] as string) as Record<string, unknown>;
};

describe("a failed order with --json", () => {
  it.each([
    { argv: ["gains", "abc"], code: 64, why: "usage", message: "uso: atlas gains" },
    { argv: ["nonsense"], code: 64, why: "usage", message: "comando desconocido: nonsense" },
    { argv: ["thesis", "show", "nope"], code: 1, why: "unknown_thesis", message: "nope" },
    { argv: ["add", "buy", "--yes"], code: 1, why: "missing_field", message: "account_id" },
    {
      argv: ["add", "buy", "--account", "acc_fund", "--quantity", "1"],
      code: 4,
      why: "confirmation_required",
      message: "añade --yes",
    },
  ])("$argv leaves {status: error, code: $why}", async ({ argv, code, why, message }) => {
    const h = harness();
    expect(await h.exec([...argv, "--json"])).toBe(code);
    const object = JSON.parse(h.out.join("\n")) as Record<string, unknown>;
    expect(object).toMatchObject({ status: "error", code: why, exit_code: code });
    expect(String(object.message)).toContain(message);
    // The sentence is also on stderr, with its «Error (code):» in front.
    expect(h.err.join("\n")).toContain(message);
  });

  it("keeps stdout empty without --json: the sentence is only on stderr", async () => {
    const h = harness();
    expect(await h.exec(["thesis", "show", "nope"])).toBe(1);
    expect(h.out).toEqual([]);
    expect(h.err.join("\n")).toContain("Error (unknown_thesis)");
  });

  it("finds --json before the arguments are read, and not after a --", async () => {
    expect(oneObject((await capture(["--json", "frobnicate"])).out)).toMatchObject({
      status: "error",
      code: "usage",
    });
    expect((await capture(["bogus", "--", "--json"])).out).toEqual([]);
  });

  it("does not add a second object when the order already printed its result", async () => {
    const out: string[] = [];
    const io: Io = { out: (t) => out.push(t), err: () => undefined, confirm: async () => true };
    const code = await reportError(io, new DomainError("some_code", "x"), {
      json: true,
      wroteStdout: () => true,
    });
    expect(code).toBe(1);
    expect(out).toEqual([]);
  });

  it("says a refusal of the file system and not a stack", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-failures-"));
    const asLedger = join(dir, "folder-as-ledger.jsonl");
    await mkdir(asLedger);
    const result = await capture(["--ledger", asLedger, "positions", "--json"]);
    expect(result.code).toBe(1);
    expect(oneObject(result.out)).toMatchObject({ status: "error", code: "EISDIR" });
    expect(result.err.join("\n")).toContain("es un directorio");
    expect(result.err.join("\n")).not.toContain("node:internal");
  });

  it("says an unexpected error as such and still returns instead of crashing", async () => {
    const compose = (): UseCaseDeps => {
      throw new TypeError("boom");
    };
    const result = await capture(["positions", "--json"], { compose });
    expect(result.code).toBe(1);
    const object = oneObject(result.out);
    expect(object).toMatchObject({
      status: "error",
      code: "unexpected",
      message: "Error inesperado (TypeError): boom",
    });
    expect(result.err.join("\n")).toContain("Error inesperado (TypeError): boom");
    // The trace is for the person at the terminal, not for the script reading the object.
    expect(result.err.join("\n")).toContain("at compose");
  });

  it("covers the lock of the folder, with its remedy", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-failures-"));
    await writeFile(
      join(dir, "ledger.lock"),
      `${JSON.stringify({ holder: "cli", token: "t", since: new Date().toISOString(), pid: 1 })}\n`,
    );
    const result = await capture([
      "--ledger",
      join(dir, "ledger.jsonl"),
      "settings",
      "set",
      "--stale-price-days",
      "5",
      "--yes",
      "--json",
    ]);
    expect(result.code).toBe(6);
    const object = oneObject(result.out);
    expect(object).toMatchObject({ status: "error", code: "ledger_locked", exit_code: 6 });
    expect(String(object.message)).toContain("atlas lock break");
  });
});

describe("the usage line", () => {
  it.each([["help"], ["--help"], ["positions", "--help"], ["-h"]])(
    "%s prints it and is not an error",
    async (...argv) => {
      const result = await capture(argv);
      expect(result.code).toBe(0);
      expect(result.out.join("\n")).toContain("uso: atlas");
      expect(result.err).toEqual([]);
    },
  );

  it("no command at all prints it and is a usage error", async () => {
    const result = await capture([]);
    expect(result.code).toBe(64);
    expect(result.out.join("\n")).toContain("uso: atlas");
  });

  it("with --json the usage is an object, and no command at all is an error object", async () => {
    const asked = await capture(["--help", "--json"]);
    expect(asked.code).toBe(0);
    expect(oneObject(asked.out).usage).toContain("uso: atlas");
    const none = await capture(["--json"]);
    expect(none.code).toBe(64);
    expect(oneObject(none.out)).toMatchObject({ status: "error", code: "usage" });
  });
});

describe("the destination of a copy that cannot be written", () => {
  it("export --out into a folder that is not there says so, without the name of the temporary", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-failures-"));
    const target = join(dir, "missing", "ledger.csv");
    const h = harness({ events: seed() });
    expect(await h.exec(["export", "--format", "csv", "--out", target, "--json"])).toBe(1);
    const object = JSON.parse(h.out.join("\n")) as { code: string; message: string };
    expect(object.code).toBe("ENOENT");
    expect(object.message).toBe(`${target}: no existe, o falta una carpeta de la ruta.`);
  });

  it("backup --to a file is refused as such, before anything is created", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-failures-"));
    const file = join(dir, "not-a-folder");
    await writeFile(file, "x");
    const h = harness({ events: seed(), ledgerPath: join(dir, "ledger.jsonl") });
    await writeFile(join(dir, "ledger.jsonl"), "");
    expect(await h.exec(["backup", "--to", file])).toBe(1);
    expect(h.err.join("\n")).toContain("Error (not_a_directory)");
  });
});
