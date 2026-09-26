// The remote ledger in S3 (ADR-0026, Part A; feature 015, E3, block 1): the
// same contract as the memory, file and browser stores, over the double of
// S3 that imitates what block 0 verified (questions.md §23.1). The etag is the
// SHA-256 of the bytes; the ETag of S3 is only the condition of the write.

import { ArchiveExistsError, ConflictError, sha256Hex } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { DependencyUnavailable, LEDGER_KEY, S3LedgerBlob } from "../../src/aws/index.js";
import { BlobLedgerStore } from "../../src/ledger-store/blob.js";
import { account, deposit, lineOf } from "../fixtures.js";
import { ledgerStoreContract } from "../ledger-store.contract.js";
import { TestOnlyFakeS3 } from "./test-only-fake-s3.js";

const textOf = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join("");
const buckets = new WeakMap<BlobLedgerStore, TestOnlyFakeS3>();

const storeOver = (s3: TestOnlyFakeS3): BlobLedgerStore => {
  const store = new BlobLedgerStore(new S3LedgerBlob(s3));
  buckets.set(store, s3);
  return store;
};

ledgerStoreContract(
  "S3",
  (lines) => {
    const s3 = new TestOnlyFakeS3();
    if (lines.length > 0) {
      s3.seed(LEDGER_KEY, textOf(lines));
    }
    return Promise.resolve(storeOver(s3));
  },
  async (store, name) => buckets.get(store as BlobLedgerStore)?.text(`archive/${name}`),
);

describe("S3LedgerBlob", () => {
  it("reads an absent ledger as empty, and creates it with If-None-Match", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = storeOver(s3);
    const { etag } = await store.load();
    expect(etag).toBe(sha256Hex(new Uint8Array()));
    await store.appendLines([lineOf(account)], etag);
    expect(s3.calls).toContain(`putIfNoneMatch ${LEDGER_KEY}`);
    expect(s3.text(LEDGER_KEY)).toBe(textOf([lineOf(account)]));
  });

  it("gives the SHA-256 of the bytes, and writes on the ETag of S3 it just read", async () => {
    const s3 = new TestOnlyFakeS3();
    s3.seed(LEDGER_KEY, textOf([lineOf(account)]));
    const store = storeOver(s3);
    const { etag } = await store.load();
    expect(etag).toBe(sha256Hex(new TextEncoder().encode(textOf([lineOf(account)]))));
    expect(etag).not.toBe(s3.etagOf(LEDGER_KEY));
    const read = s3.etagOf(LEDGER_KEY);
    await store.appendLines([lineOf(deposit)], etag);
    expect(s3.conditions.at(-1)).toEqual({ key: LEDGER_KEY, ifMatch: read });
  });

  it("loses a race to another writer with a ConflictError, and the other's bytes stay", async () => {
    for (const how of ["412", "409"] as const) {
      const s3 = new TestOnlyFakeS3();
      s3.seed(LEDGER_KEY, textOf([lineOf(account)]));
      const store = storeOver(s3);
      const { etag } = await store.load();
      if (how === "412") {
        s3.beforePut = () => {
          s3.beforePut = undefined;
          s3.seed(LEDGER_KEY, textOf([lineOf(account), lineOf(deposit), lineOf(deposit)]));
        };
      } else {
        s3.conflictNext();
      }
      await expect(store.appendLines([lineOf(deposit)], etag)).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(s3.text(LEDGER_KEY)).toBe(
        how === "412"
          ? textOf([lineOf(account), lineOf(deposit), lineOf(deposit)])
          : textOf([lineOf(account)]),
      );
    }
  });

  it("loses the race to create the ledger too", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = storeOver(s3);
    const { etag } = await store.load();
    s3.beforePut = () => {
      s3.beforePut = undefined;
      s3.seed(LEDGER_KEY, textOf([lineOf(deposit)]));
    };
    await expect(store.appendLines([lineOf(account)], etag)).rejects.toBeInstanceOf(ConflictError);
    expect(s3.text(LEDGER_KEY)).toBe(textOf([lineOf(deposit)]));
  });

  it("never overwrites an archive, and leaves one behind only as an exact copy when a race is lost", async () => {
    const s3 = new TestOnlyFakeS3();
    const before = textOf([lineOf(account)]);
    s3.seed(LEDGER_KEY, before);
    s3.seed("archive/taken.jsonl", "kept");
    const store = storeOver(s3);
    const { etag } = await store.load();
    await expect(store.replaceLines([lineOf(deposit)], etag, "taken.jsonl")).rejects.toBeInstanceOf(
      ArchiveExistsError,
    );
    expect(s3.text("archive/taken.jsonl")).toBe("kept");
    expect(s3.text(LEDGER_KEY)).toBe(before);
    // Another writer wins between the archive and the write: the archive is
    // the exact bytes that were the ledger, and the ledger is the other's.
    s3.beforePut = (key) => {
      if (key === LEDGER_KEY) {
        s3.beforePut = undefined;
        s3.seed(LEDGER_KEY, textOf([lineOf(account), lineOf(deposit), lineOf(deposit)]));
      }
    };
    await expect(store.replaceLines([lineOf(deposit)], etag, "lost.jsonl")).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(s3.text("archive/lost.jsonl")).toBe(before);
    expect(s3.text(LEDGER_KEY)).toBe(textOf([lineOf(account), lineOf(deposit), lineOf(deposit)]));
    // A retry with the same name never writes over it.
    const again = await store.load();
    await expect(
      store.replaceLines([lineOf(deposit)], again.etag, "lost.jsonl"),
    ).rejects.toBeInstanceOf(ArchiveExistsError);
    expect(s3.text("archive/lost.jsonl")).toBe(before);
  });

  it("lets a failure of S3 through as what it is, never as a conflict", async () => {
    const s3 = new TestOnlyFakeS3();
    s3.seed(LEDGER_KEY, textOf([lineOf(account)]));
    const store = storeOver(s3);
    const { etag } = await store.load();
    s3.failNext();
    await expect(store.appendLines([lineOf(deposit)], etag)).rejects.toBeInstanceOf(
      DependencyUnavailable,
    );
  });
});
