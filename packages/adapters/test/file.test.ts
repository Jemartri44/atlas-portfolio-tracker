import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConflictError, SchemaTooNewError, ValidationError } from "@atlas/domain";
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

  it("loads the synthetic fixtures with the documented outcomes", async () => {
    const at = (name: string) => new FileLedgerStore(join(fixtures, name));
    expect((await at("valid-v1.jsonl").load()).events.map((e) => e.type)).toEqual([
      "account_created",
      "asset_created",
      "asset_created",
      "cash_deposit",
      "buy",
      "sell",
      "transfer",
    ]);
    expect((await at("no-trailing-newline.jsonl").load()).events).toHaveLength(2);
    expect((await at("empty.jsonl").load()).events).toEqual([]);
    await expect(at("future-version.jsonl").load()).rejects.toBeInstanceOf(SchemaTooNewError);
    await expect(at("number-amount.jsonl").load()).rejects.toBeInstanceOf(ValidationError);
    expect(futureLine()).toContain('"schema_version":2');
  });
});
