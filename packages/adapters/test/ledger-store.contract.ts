// Contract every LedgerStore must honour (specs/001-ledger-core/contracts/ports.md §2).

import { ConflictError, type LedgerStore, SchemaTooNewError } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { account, deposit, futureLine, lineOf } from "./fixtures.js";

export type StoreFactory = (lines: readonly string[]) => Promise<LedgerStore>;

export const ledgerStoreContract = (name: string, factory: StoreFactory): void => {
  describe(`LedgerStore contract: ${name}`, () => {
    it("loads an empty ledger with a stable etag", async () => {
      const store = await factory([]);
      const first = await store.load();
      const second = await store.load();
      expect(first.events).toEqual([]);
      expect(second.etag).toBe(first.etag);
    });

    it("appends in order and changes the etag", async () => {
      const store = await factory([lineOf(account)]);
      const { etag } = await store.load();
      const appended = await store.append([deposit], etag);
      expect(appended.etag).not.toBe(etag);
      const reloaded = await store.load();
      expect(reloaded.events).toEqual([account, deposit]);
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
  });
};
