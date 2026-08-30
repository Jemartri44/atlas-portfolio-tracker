// Contract every LedgerStore must honour (specs/001-ledger-core/contracts/ports.md §2,
// extended by feature 003 with raw lines and replace).

import {
  ArchiveExistsError,
  ConflictError,
  CURRENT_LEDGER_SCHEMA,
  type LedgerStore,
  SchemaTooNewError,
} from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { account, deposit, futureLine, lineOf } from "./fixtures.js";

export type StoreFactory = (lines: readonly string[]) => Promise<LedgerStore>;

export const ledgerStoreContract = (name: string, factory: StoreFactory): void => {
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
  });
};
