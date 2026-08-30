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

describe("atlas synth, check --deep, compact and backup over real files", () => {
  it("generates, verifies, has nothing to compact and backs up a verified copy", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-e2e-003-"));
    const ledger = join(dir, "demo.jsonl");
    const { io, lines } = capture();
    const atlas = (...argv: string[]) => run(["--ledger", ledger, ...argv], io);
    expect(await atlas("synth", "--out", ledger, "--seed", "5")).toBe(0);
    expect(lines.join("\n")).toContain("semilla 5");
    lines.length = 0;
    expect(await atlas("check", "--deep")).toBe(0);
    expect(lines.join("\n")).toContain("same_asset_two_accounts");
    lines.length = 0;
    expect(await atlas("compact", "--yes")).toBe(0);
    expect(lines.join("\n")).toContain("Nada que compactar");
    lines.length = 0;
    const backups = join(dir, "backups");
    expect(await atlas("backup", "--to", backups)).toBe(0);
    const copyPath = /Copia verificada: (\S+\.jsonl)/.exec(lines.join("\n"))?.[1] as string;
    expect(await readFile(copyPath)).toEqual(await readFile(ledger));
    expect(await atlas("backup", "--to", backups)).toBe(1);
    expect(lines.join("\n")).toContain("ya existe");
    lines.length = 0;
    expect(await run(["--ledger", join(dir, "none.jsonl"), "backup", "--to", backups], io)).toBe(1);
    expect(lines.join("\n")).toContain("nada que copiar");
    lines.length = 0;
    // A hand-edited line: the plain check stays clean, the deep check does not.
    const text = await readFile(ledger, "utf8");
    const edited = text.replace(/"quantity":"([0-9.]+)"/, '"quantity":"777"');
    expect(edited).not.toBe(text);
    await writeFile(ledger, edited);
    expect(await atlas("check")).toBe(0);
    lines.length = 0;
    expect(await atlas("check", "--deep")).toBe(1);
    expect(lines.join("\n")).toContain("fingerprint_mismatch");
  });
});

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

  it("runs the corporate action and thesis flows of the 002 quickstart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-e2e-002-"));
    const ledger = join(dir, "demo.jsonl");
    const { io, lines } = capture();
    const atlas = (...argv: string[]) => run(["--ledger", ledger, ...argv, "--yes"], io);
    const account = (id: string, book: string) =>
      atlas(
        "account",
        "add",
        "--id",
        id,
        "--name",
        id,
        "--platform",
        "ibkr",
        "--book",
        book,
        "--base-currency",
        "EUR",
        "--country",
        "IE",
      );
    const stock = (id: string, book: string, ...extra: string[]) =>
      atlas(
        "asset",
        "add",
        "--id",
        id,
        "--type",
        "stock",
        "--book",
        book,
        "--name",
        id,
        "--currency",
        "EUR",
        "--not-transferable",
        ...extra,
      );
    const buy = (
      account: string,
      asset: string,
      quantity: string,
      date: string,
      ...extra: string[]
    ) =>
      atlas(
        "add",
        "buy",
        "--account",
        account,
        "--asset",
        asset,
        "--trade-date",
        date,
        "--value-date",
        date,
        "--quantity",
        quantity,
        "--unit-price",
        "100",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        date,
        ...extra,
      );

    expect(await account("acc_a", "core")).toBe(0);
    expect(await account("acc_b", "core")).toBe(0);
    expect(await stock("ast_old", "core", "--asset-class", "equity")).toBe(0);
    expect(await buy("acc_a", "ast_old", "10", "2027-01-10")).toBe(0);
    expect(await buy("acc_b", "ast_old", "7", "2027-02-10")).toBe(0);
    expect(
      await atlas(
        "ca",
        "reverse-split",
        "--asset",
        "ast_old",
        "--ratio",
        "1/4",
        "--effective-date",
        "2027-04-01",
        "--source-document",
        "https://issuer.example/reverse.pdf",
        "--cash-per-share",
        "400",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-04-01",
      ),
    ).toBe(0);
    lines.length = 0;
    expect(await atlas("positions")).toBe(0);
    expect(lines.join("\n")).toMatch(/acc_a\s+ast_old\s+2\n.*acc_b\s+ast_old\s+1/);
    lines.length = 0;
    expect(await atlas("gains", "2027")).toBe(0);
    expect(lines.join("\n")).toContain("corporate_action:reverse_split");

    expect(await account("acc_bucket", "bucket")).toBe(0);
    expect(await stock("ast_spec", "bucket")).toBe(0);
    expect(await buy("acc_bucket", "ast_spec", "10", "2027-07-01")).toBe(1);
    expect(
      await atlas(
        "thesis",
        "open",
        "--id",
        "th1",
        "--account",
        "acc_bucket",
        "--asset",
        "ast_spec",
        "--hypothesis",
        "h",
        "--horizon-days",
        "90",
        "--invalidation",
        "i",
        "--planned-size",
        "500",
      ),
    ).toBe(0);
    expect(await buy("acc_bucket", "ast_spec", "10", "2027-07-01", "--thesis", "th1")).toBe(0);
    expect(await atlas("thesis", "close", "th1", "--notes", "done")).toBe(0);
    lines.length = 0;
    expect(await atlas("thesis", "list", "--closed")).toBe(0);
    expect(lines.join("\n")).toMatch(/th1\s+acc_bucket\s+ast_spec\s+cerrada/);
    expect(await atlas("check")).toBe(0);
    expect((await readFile(ledger, "utf8")).trim().split("\n")).toHaveLength(11);
  });
});
