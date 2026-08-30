import { describe, expect, it } from "vitest";
import { systemClock } from "../src/clock/system.js";
import { MemoryLedgerStore } from "../src/ledger-store/memory.js";
import { webCryptoRandom } from "../src/random/web-crypto.js";
import { account, deposit, lineOf } from "./fixtures.js";
import { ledgerStoreContract } from "./ledger-store.contract.js";

ledgerStoreContract("memory", (lines) => Promise.resolve(MemoryLedgerStore.fromLines(lines)));

describe("MemoryLedgerStore", () => {
  it("can be seeded from events and renders the file text", async () => {
    const store = MemoryLedgerStore.fromEvents([account]);
    const { etag } = await store.load();
    await store.append([deposit], etag);
    expect(store.toText()).toBe(`${lineOf(account)}\n${lineOf(deposit)}\n`);
    expect((await MemoryLedgerStore.empty().load()).events).toEqual([]);
  });

  it("keeps the archives written by replace", async () => {
    const store = MemoryLedgerStore.fromLines([lineOf(account), lineOf(deposit)]);
    const { etag } = await store.load();
    await store.replace([deposit], etag, "ledger-2026-09-01-v1.jsonl");
    expect([...store.archives.entries()]).toEqual([
      ["ledger-2026-09-01-v1.jsonl", `${lineOf(account)}\n${lineOf(deposit)}\n`],
    ]);
    expect(store.toText()).toBe(`${lineOf(deposit)}\n`);
  });
});

describe("system adapters", () => {
  it("provide the current time and random bytes", () => {
    const before = Date.now();
    expect(systemClock.now().getTime()).toBeGreaterThanOrEqual(before);
    const bytes = new Uint8Array(16);
    webCryptoRandom(bytes);
    expect(bytes.some((byte) => byte !== 0)).toBe(true);
  });
});
