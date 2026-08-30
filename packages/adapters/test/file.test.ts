import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ArchiveExistsError,
  ConflictError,
  type LedgerSchema,
  SchemaTooNewError,
  ValidationError,
} from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { FileLedgerStore } from "../src/ledger-store/file.js";
import { account, deposit, futureLine, lineOf } from "./fixtures.js";
import { ledgerStoreContract } from "./ledger-store.contract.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/ledger");

const fresh = async (content?: string): Promise<{ path: string; dir: string }> => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-ledger-"));
  const path = join(dir, "ledger.jsonl");
  if (content !== undefined) {
    await writeFile(path, content);
  }
  return { path, dir };
};

ledgerStoreContract("file", async (lines) => {
  const { path } = await fresh(lines.map((line) => `${line}\n`).join(""));
  return new FileLedgerStore(path);
});

describe("FileLedgerStore", () => {
  it("treats a missing file as empty and creates it on the first append", async () => {
    const { path, dir } = await fresh();
    const store = new FileLedgerStore(path);
    const { events, etag } = await store.load();
    expect(events).toEqual([]);
    await store.append([account], etag);
    expect(await readFile(path, "utf8")).toBe(`${lineOf(account)}\n`);
    expect(await readdir(dir)).toEqual(["ledger.jsonl"]);
  });

  it("keeps the original bytes verbatim and adds the missing newline exactly once", async () => {
    const original = lineOf(account);
    const { path } = await fresh(original);
    const store = new FileLedgerStore(path);
    const { etag } = await store.load();
    await store.append([deposit], etag);
    const bytes = await readFile(path);
    expect(bytes.subarray(0, Buffer.byteLength(original)).toString("utf8")).toBe(original);
    expect(bytes.toString("utf8")).toBe(`${original}\n${lineOf(deposit)}\n`);
    const reloaded = await store.load();
    expect(reloaded.events).toHaveLength(2);
    await store.append([deposit], reloaded.etag);
    expect((await readFile(path, "utf8")).split("\n")).toHaveLength(4);
  });

  it("detects a concurrent write by another process", async () => {
    const { path } = await fresh(`${lineOf(account)}\n`);
    const store = new FileLedgerStore(path);
    const { etag } = await store.load();
    await new FileLedgerStore(path).append([deposit], etag);
    await expect(store.append([deposit], etag)).rejects.toBeInstanceOf(ConflictError);
    expect((await store.load()).events).toHaveLength(2);
  });

  it("reports the line number of an invalid line and rejects blank lines", async () => {
    const { path } = await fresh(`${lineOf(account)}\n\n${lineOf(deposit)}\n`);
    const error = await new FileLedgerStore(path).load().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details.line).toBe(2);
    expect((error as ValidationError).message).toMatch(/^line 2:/);
  });

  it("rethrows unexpected filesystem errors", async () => {
    const { dir } = await fresh();
    await expect(new FileLedgerStore(dir).load()).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("archives the exact bytes under archive/ before replacing, and never twice", async () => {
    const original = `${lineOf(account)}\n${lineOf(deposit)}\n`;
    const { path, dir } = await fresh(original);
    const store = new FileLedgerStore(path);
    const { etag } = await store.load();
    await store.replace([account], etag, "ledger-2026-09-01-v1.jsonl");
    expect((await readdir(dir)).sort()).toEqual(["archive", "ledger.jsonl"]);
    expect(await readFile(join(dir, "archive", "ledger-2026-09-01-v1.jsonl"), "utf8")).toBe(
      original,
    );
    expect(await readFile(path, "utf8")).toBe(`${lineOf(account)}\n`);
    const current = await store.load();
    await expect(
      store.replace([], current.etag, "ledger-2026-09-01-v1.jsonl"),
    ).rejects.toBeInstanceOf(ArchiveExistsError);
    expect(await readFile(path, "utf8")).toBe(`${lineOf(account)}\n`);
    await expect(store.replace([], current.etag, "../escape.jsonl")).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(store.replace([], current.etag, "")).rejects.toBeInstanceOf(ValidationError);
    await expect(store.replace([], etag, "b.jsonl")).rejects.toBeInstanceOf(ConflictError);
    expect((await readdir(join(dir, "archive"))).sort()).toEqual(["ledger-2026-09-01-v1.jsonl"]);
  });

  it("rethrows unexpected errors while opening the archive", async () => {
    const { path, dir } = await fresh(`${lineOf(account)}\n`);
    await writeFile(join(dir, "archive"), "not a directory");
    const store = new FileLedgerStore(path);
    const { etag } = await store.load();
    await expect(store.replace([account], etag, "a.jsonl")).rejects.toMatchObject({
      code: expect.stringMatching(/^E/),
    });
    expect(await readFile(path, "utf8")).toBe(`${lineOf(account)}\n`);
  });

  it("decodes with an injected schema and appends without re-serialising old lines", async () => {
    const legacy = await readFile(join(fixtures, "legacy-v1-for-test-schema.jsonl"), "utf8");
    const { path } = await fresh(legacy);
    const v2: LedgerSchema = { version: 2, migrations: new Map([[1, (line) => line]]) };
    const store = new FileLedgerStore(path, v2);
    const loaded = await store.load();
    expect(loaded.events.map((event) => event.schema_version)).toEqual([2, 2, 2, 2]);
    expect(loaded.lines).toHaveLength(4);
    expect(loaded.lines.every((line) => line.includes('"schema_version":1'))).toBe(true);
    await store.append([{ ...deposit, schema_version: 2 }], loaded.etag);
    const bytes = await readFile(path, "utf8");
    expect(bytes.startsWith(legacy)).toBe(true);
    expect(bytes.slice(legacy.length)).toBe(`${lineOf({ ...deposit, schema_version: 2 })}\n`);
    expect((await store.load()).events).toHaveLength(5);
    await expect(new FileLedgerStore(path).load()).rejects.toBeInstanceOf(SchemaTooNewError);
    const { path: newer } = await fresh(
      lineOf(account).replace('"schema_version":1', '"schema_version":3'),
    );
    await expect(new FileLedgerStore(newer, v2).load()).rejects.toBeInstanceOf(SchemaTooNewError);
  });

  it("loads the synthetic fixtures with the documented outcomes", async () => {
    const at = (name: string) => new FileLedgerStore(join(fixtures, name));
    const valid = await at("valid-v1.jsonl").load();
    expect(valid.lines).toHaveLength(valid.events.length);
    expect(valid.events.map((e) => e.type)).toEqual([
      "account_created",
      "asset_created",
      "asset_created",
      "cash_deposit",
      "buy",
      "sell",
      "transfer",
    ]);
    const synthetic = await at("synthetic-v1.jsonl").load();
    expect(synthetic.lines).toHaveLength(synthetic.events.length);
    expect(synthetic.events.length).toBeGreaterThan(100);
    expect((await at("no-trailing-newline.jsonl").load()).events).toHaveLength(2);
    expect((await at("empty.jsonl").load()).events).toEqual([]);
    await expect(at("future-version.jsonl").load()).rejects.toBeInstanceOf(SchemaTooNewError);
    await expect(at("number-amount.jsonl").load()).rejects.toBeInstanceOf(ValidationError);
    expect(futureLine()).toContain('"schema_version":2');
  });
});
