// The browser store enters the project with the same level of proof as the file
// one: it runs the port contract of specs/001-ledger-core (ADR-0019). The bytes
// live in a `MemoryBlob` here, which is why no browser is needed — the two real
// handles (`../src/ledger-store/browser/`) are twenty lines each over the same
// three methods and are verified by hand (prompt §5).

import { ArchiveExistsError, ConflictError, ValidationError } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { BlobArchiveExists, BlobLedgerStore, type LedgerBlob } from "../src/ledger-store/blob.js";
import { account, deposit, lineOf } from "./fixtures.js";
import { ledgerStoreContract } from "./ledger-store.contract.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

class MemoryBlob implements LedgerBlob {
  readonly label = "memoria";
  bytes: Uint8Array;
  readonly archives = new Map<string, string>();

  constructor(text = "") {
    this.bytes = encoder.encode(text);
  }

  async read(): Promise<Uint8Array> {
    return this.bytes;
  }

  async write(bytes: Uint8Array): Promise<void> {
    this.bytes = new Uint8Array(bytes);
  }

  async writeArchive(name: string, bytes: Uint8Array): Promise<void> {
    if (this.archives.has(name)) {
      throw new BlobArchiveExists(name);
    }
    this.archives.set(name, decoder.decode(bytes));
  }

  get text(): string {
    return decoder.decode(this.bytes);
  }
}

const textOf = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join("");

ledgerStoreContract("blob", (lines) =>
  Promise.resolve(new BlobLedgerStore(new MemoryBlob(textOf(lines)))),
);

describe("BlobLedgerStore", () => {
  it("reads an absent ledger as empty and says where it is", async () => {
    const blob = new MemoryBlob();
    const store = new BlobLedgerStore(blob);
    expect(store.label).toBe("memoria");
    const loaded = await store.load();
    expect(loaded.events).toEqual([]);
    expect(loaded.lines).toEqual([]);
  });

  it("keeps the previous bytes verbatim on append", async () => {
    // A line written by another client, canonical or not, must survive intact.
    const foreign = `${JSON.stringify({ ...account, name: "Escrita por otro cliente" })}`;
    const blob = new MemoryBlob(`${foreign}\n`);
    const store = new BlobLedgerStore(blob);
    const { etag } = await store.load();
    await store.append([deposit], etag);
    expect(blob.text).toBe(`${foreign}\n${lineOf(deposit)}\n`);
  });

  it("adds the missing newline of a file that did not end in one", async () => {
    const blob = new MemoryBlob(lineOf(account));
    const store = new BlobLedgerStore(blob);
    const { etag } = await store.load();
    await store.append([deposit], etag);
    expect(blob.text).toBe(`${lineOf(account)}\n${lineOf(deposit)}\n`);
  });

  it("reports the line number of an invalid line", async () => {
    const blob = new MemoryBlob(`${lineOf(account)}\n{"schema_version":1,"id":"x"}\n`);
    const store = new BlobLedgerStore(blob);
    await expect(store.load()).rejects.toThrow(/line 2/);
    await expect(store.load()).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an archive name that is a path", async () => {
    const store = new BlobLedgerStore(new MemoryBlob(`${lineOf(account)}\n`));
    const { etag } = await store.load();
    await expect(store.replace([account], etag, "a/b.jsonl")).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(store.replace([account], etag, "")).rejects.toBeInstanceOf(ValidationError);
  });

  it("archives the original bytes before rewriting, and never twice", async () => {
    const blob = new MemoryBlob(`${lineOf(account)}\n${lineOf(deposit)}\n`);
    const store = new BlobLedgerStore(blob);
    const first = await store.load();
    await store.replace([account], first.etag, "ledger-2026-09-01-v1.jsonl");
    expect(blob.archives.get("ledger-2026-09-01-v1.jsonl")).toBe(
      `${lineOf(account)}\n${lineOf(deposit)}\n`,
    );
    const second = await store.load();
    await expect(
      store.replace([account], second.etag, "ledger-2026-09-01-v1.jsonl"),
    ).rejects.toBeInstanceOf(ArchiveExistsError);
    // The refused archive left the ledger untouched.
    expect(blob.text).toBe(`${lineOf(account)}\n`);
  });

  it("does not write when the etag is stale", async () => {
    const blob = new MemoryBlob(`${lineOf(account)}\n`);
    const store = new BlobLedgerStore(blob);
    const { etag } = await store.load();
    await store.append([deposit], etag);
    await expect(store.append([deposit], etag)).rejects.toBeInstanceOf(ConflictError);
    await expect(store.replace([account], etag, "x.jsonl")).rejects.toBeInstanceOf(ConflictError);
    expect(blob.archives.size).toBe(0);
    expect(blob.text).toBe(`${lineOf(account)}\n${lineOf(deposit)}\n`);
  });

  it("propagates an unexpected failure of the blob instead of dressing it as a conflict", async () => {
    const blob = new MemoryBlob(`${lineOf(account)}\n`);
    const store = new BlobLedgerStore(blob);
    const { etag } = await store.load();
    blob.writeArchive = () => Promise.reject(new Error("disco lleno"));
    await expect(store.replace([account], etag, "x.jsonl")).rejects.toThrow("disco lleno");
  });
});
