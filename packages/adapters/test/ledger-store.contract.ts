// Contract every LedgerStore must honour (specs/001-ledger-core/contracts/ports.md §2,
// extended by feature 003 with raw lines and replace).

import {
  ArchiveExistsError,
  ConflictError,
  CURRENT_LEDGER_SCHEMA,
  type LedgerStore,
  SchemaTooNewError,
  ValidationError,
} from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { account, deposit, futureLine, lineOf } from "./fixtures.js";

export type StoreFactory = (lines: readonly string[]) => Promise<LedgerStore>;

/** The exact text of an archive a store wrote, or `undefined` when there is none. */
export type ArchiveReader = (store: LedgerStore, name: string) => Promise<string | undefined>;

/**
 * A line the application never writes: keys in another order, spaces, an
 * escaped character. `append` would re-serialise it; the raw-line operations
 * keep it byte for byte (feature 014, block 1, mutant 1).
 */
export const nonCanonical = (): string => {
  const record = JSON.parse(lineOf(deposit)) as Record<string, unknown>;
  const reordered = Object.fromEntries(Object.entries(record).reverse());
  return ` ${JSON.stringify(reordered, null, 1).replaceAll("\n", "")}`.replace(
    '"acc_test"',
    '"acc_\\u0074est"',
  );
};

const textOf = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join("");

export const ledgerStoreContract = (
  name: string,
  factory: StoreFactory,
  archiveOf: ArchiveReader,
): void => {
  describe(`LedgerStore contract: ${name}`, () => {
    it("loads an empty ledger with a stable etag and no lines", async () => {
      const store = await factory([]);
      const first = await store.load();
      const second = await store.load();
      expect(first.events).toEqual([]);
      expect(first.lines).toEqual([]);
      expect(second.etag).toBe(first.etag);
      expect(store.schema).toBe(CURRENT_LEDGER_SCHEMA);
    });

    it("appends in order, changes the etag and returns the raw lines", async () => {
      const store = await factory([lineOf(account)]);
      const { etag, lines } = await store.load();
      expect(lines).toEqual([lineOf(account)]);
      const appended = await store.append([deposit], etag);
      expect(appended.etag).not.toBe(etag);
      const reloaded = await store.load();
      expect(reloaded.events).toEqual([account, deposit]);
      expect(reloaded.lines).toEqual([lineOf(account), lineOf(deposit)]);
      expect(reloaded.etag).toBe(appended.etag);
    });

    it("rejects a stale etag without touching the ledger", async () => {
      const store = await factory([lineOf(account)]);
      const { etag } = await store.load();
      await store.append([deposit], etag);
      await expect(store.append([deposit], etag)).rejects.toBeInstanceOf(ConflictError);
      expect((await store.load()).events).toHaveLength(2);
    });

    it("refuses to load a line written by a newer schema", async () => {
      const store = await factory([lineOf(account), futureLine()]);
      await expect(store.load()).rejects.toBeInstanceOf(SchemaTooNewError);
    });

    it("replaces the whole content canonically and archives the original first", async () => {
      const store = await factory([lineOf(account), lineOf(deposit)]);
      const { etag } = await store.load();
      const replaced = await store.replace([account], etag, "ledger-2026-09-01-v1.jsonl");
      expect(replaced.etag).not.toBe(etag);
      const reloaded = await store.load();
      expect(reloaded.events).toEqual([account]);
      expect(reloaded.lines).toEqual([lineOf(account)]);
      expect(reloaded.etag).toBe(replaced.etag);
    });

    it("never overwrites an archive and never writes on a stale etag", async () => {
      const store = await factory([lineOf(account)]);
      const { etag } = await store.load();
      await store.replace([account, deposit], etag, "ledger-2026-09-01-v1.jsonl");
      const current = await store.load();
      await expect(store.replace([account], etag, "other.jsonl")).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(
        store.replace([account], current.etag, "ledger-2026-09-01-v1.jsonl"),
      ).rejects.toBeInstanceOf(ArchiveExistsError);
      const after = await store.load();
      expect(after.lines).toEqual(current.lines);
      expect(after.etag).toBe(current.etag);
    });

    it("appends raw lines byte for byte, never re-serialised", async () => {
      const store = await factory([lineOf(account)]);
      const { etag } = await store.load();
      const odd = nonCanonical();
      expect(odd).not.toBe(lineOf(deposit));
      const appended = await store.appendLines([odd], etag);
      const reloaded = await store.load();
      expect(reloaded.lines).toEqual([lineOf(account), odd]);
      expect(reloaded.events).toEqual([account, deposit]);
      expect(reloaded.etag).toBe(appended.etag);
      expect(appended.etag).not.toBe(etag);
    });

    it("replaces with raw lines byte for byte, archiving the exact bytes first", async () => {
      const store = await factory([lineOf(account), lineOf(deposit)]);
      const { etag } = await store.load();
      const odd = nonCanonical();
      const replaced = await store.replaceLines(
        [lineOf(account), odd],
        etag,
        "pre-sync-2026-09-25.jsonl",
      );
      const reloaded = await store.load();
      expect(reloaded.lines).toEqual([lineOf(account), odd]);
      expect(reloaded.etag).toBe(replaced.etag);
      expect(await archiveOf(store, "pre-sync-2026-09-25.jsonl")).toBe(
        textOf([lineOf(account), lineOf(deposit)]),
      );
    });

    it("writes no raw line on a stale etag or over an existing archive", async () => {
      const store = await factory([lineOf(account)]);
      const { etag } = await store.load();
      await store.replaceLines([lineOf(account), lineOf(deposit)], etag, "a.jsonl");
      const current = await store.load();
      await expect(store.appendLines([lineOf(deposit)], etag)).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(store.replaceLines([lineOf(account)], etag, "b.jsonl")).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(
        store.replaceLines([lineOf(account)], current.etag, "a.jsonl"),
      ).rejects.toBeInstanceOf(ArchiveExistsError);
      const after = await store.load();
      expect(after.lines).toEqual(current.lines);
      expect(after.etag).toBe(current.etag);
      expect(await archiveOf(store, "b.jsonl")).toBeUndefined();
    });

    it("refuses an archive name that is not a plain file name, in replace and replaceLines", async () => {
      for (const bad of ["", "sub/a.jsonl", "sub\\a.jsonl"]) {
        const store = await factory([lineOf(account)]);
        const { etag } = await store.load();
        for (const attempt of [
          () => store.replace([account], etag, bad),
          () => store.replaceLines([lineOf(account)], etag, bad),
        ]) {
          const error = await attempt().catch((e: unknown) => e);
          expect(error).toBeInstanceOf(ValidationError);
          expect((error as ValidationError).code).toBe("invalid_archive_name");
        }
        expect((await store.load()).etag).toBe(etag);
      }
    });

    it("refuses, writing nothing, a raw line the loader would refuse", async () => {
      const cases: Array<[string, (error: unknown) => void]> = [
        [futureLine(), (error) => expect(error).toBeInstanceOf(SchemaTooNewError)],
        ["{", (error) => expect((error as ValidationError).code).toBe("invalid_json")],
        [
          `${lineOf(deposit)}\n${lineOf(deposit)}`,
          (error) => expect((error as ValidationError).code).toBe("raw_line_break"),
        ],
        [
          `${lineOf(deposit)}\r`,
          (error) => expect((error as ValidationError).code).toBe("raw_line_break"),
        ],
      ];
      for (const [line, check] of cases) {
        const store = await factory([lineOf(account)]);
        const { etag, lines } = await store.load();
        check(await store.appendLines([lineOf(deposit), line], etag).catch((e: unknown) => e));
        check(
          await store
            .replaceLines([lineOf(account), line], etag, "x.jsonl")
            .catch((e: unknown) => e),
        );
        const after = await store.load();
        expect(after.lines).toEqual(lines);
        expect(after.etag).toBe(etag);
        expect(await archiveOf(store, "x.jsonl")).toBeUndefined();
      }
    });
  });
};
