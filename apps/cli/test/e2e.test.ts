// End to end over a real temporary file, through the default composition.

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Io } from "../src/context.js";
import { run, USAGE } from "../src/main.js";

const capture = () => {
  const lines: string[] = [];
  const io: Io = {
    out: (t) => lines.push(t),
    err: (t) => lines.push(t),
    confirm: async () => undefined,
  };
  return { io, lines };
};

describe("atlas over a ledger file", () => {
  it("runs the quickstart flow and keeps the file readable", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-e2e-"));
    const ledger = join(dir, "demo.jsonl");
    const { io, lines } = capture();
    const atlas = (...argv: string[]) => run(["--ledger", ledger, ...argv], io);
    expect(
      await atlas(
        "account",
        "add",
        "--id",
        "acc_fund",
        "--name",
        "Fondos",
        "--platform",
        "myinvestor",
        "--book",
        "core",
        "--base-currency",
        "EUR",
        "--country",
        "ES",
        "--yes",
      ),
    ).toBe(0);
    expect(
      await atlas(
        "asset",
        "add",
        "--id",
        "ast_world",
        "--type",
        "fund",
        "--book",
        "core",
        "--asset-class",
        "equity",
        "--name",
        "World Index",
        "--currency",
        "EUR",
        "--transferable",
        "--isin",
        "XX0000000001",
        "--yes",
      ),
    ).toBe(0);
    expect(
      await atlas(
        "add",
        "buy",
        "--account",
        "acc_fund",
        "--asset",
        "ast_world",
        "--trade-date",
        "2026-09-01",
        "--value-date",
        "2026-09-02",
        "--quantity",
        "10.123456",
        "--amount",
        "1000",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2026-09-02",
        "--yes",
      ),
    ).toBe(0);
    const before = await readFile(ledger, "utf8");
    expect(before.split("\n")).toHaveLength(4);
    expect(
      await atlas(
        "add",
        "cash-in",
        "--account",
        "acc_fund",
        "--value-date",
        "2027-03-10",
        "--amount",
        "500",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--yes",
      ),
    ).toBe(0);
    const after = await readFile(ledger, "utf8");
    expect(after.startsWith(before)).toBe(true);
    lines.length = 0;
    expect(await atlas("positions")).toBe(0);
    expect(lines.join("\n")).toContain("10.123456");
    lines.length = 0;
    expect(await atlas("export")).toBe(0);
    expect(`${lines.join("\n")}\n`).toBe(after);
    expect(await atlas("check")).toBe(0);
    expect(
      await atlas(
        "add",
        "buy",
        "--account",
        "acc_fund",
        "--asset",
        "ast_world",
        "--trade-date",
        "2026-09-01",
        "--value-date",
        "2026-09-02",
        "--quantity",
        "1",
        "--unit-price",
        "1",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2026-09-02",
      ),
    ).toBe(4);
  });

  it("refuses a ledger written by a newer schema and explains usage", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-e2e-"));
    const ledger = join(dir, "future.jsonl");
    await writeFile(
      ledger,
      '{"schema_version":2,"id":"01ARYZ6S41TSV4RRFFQ6900000","recorded_at":"2026-09-01T18:00:00.000Z","type":"cash_deposit"}\n',
    );
    const { io, lines } = capture();
    expect(await run(["--ledger", ledger, "positions"], io)).toBe(5);
    expect(lines.join("\n")).toContain("schema_version 2");
    expect(await readFile(ledger, "utf8")).toContain('"schema_version":2');
    lines.length = 0;
    expect(await run([], io)).toBe(64);
    expect(lines[0]).toBe(USAGE);
    expect(await run(["help"], io)).toBe(0);
    expect(await run(["frobnicate"], io)).toBe(64);
    expect(await run(["positions", "--ledger"], io)).toBe(64);
  });
});
