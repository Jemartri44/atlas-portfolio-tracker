import { describe, expect, it } from "vitest";
import { ArchiveExistsError, ConflictError } from "../../src/errors.js";
import { encodeLine } from "../../src/schema/line.js";
import { loadAndProject } from "../../src/usecases/project-ledger.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { TEST_SCHEMA_V2 } from "../schema/test-schema.js";

describe("loadAndProject", () => {
  it("returns the events, the projection, the etag and the raw lines", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const events = b.build();
    const store = new TestStore(events);
    const loaded = await loadAndProject({ store });
    expect(loaded.events).toEqual(events);
    expect(loaded.lines).toEqual(events.map(encodeLine));
    expect(loaded.etag).toBe("0");
    expect(loaded.state.accounts.size).toBe(3);
  });
});

describe("TestStore (domain test double of LedgerStore)", () => {
  it("replaces the content after archiving the original bytes, once per archive name", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const events = b.build();
    const store = new TestStore(events);
    const original = store.text();
    const { etag } = await store.load();
    const replaced = await store.replace(events.slice(0, 2), etag, "ledger-2026-09-01-v1.jsonl");
    expect(store.archives.get("ledger-2026-09-01-v1.jsonl")).toBe(original);
    expect((await store.load()).events).toEqual(events.slice(0, 2));
    await expect(store.replace(events, etag, "other")).rejects.toBeInstanceOf(ConflictError);
    await expect(
      store.replace(events, replaced.etag, "ledger-2026-09-01-v1.jsonl"),
    ).rejects.toBeInstanceOf(ArchiveExistsError);
    expect(store.all()).toHaveLength(2);
  });

  it("decodes with its schema", async () => {
    const line = encodeLine({ ...new LedgerBuilder().account("acc_a"), note: "x" } as never);
    const store = TestStore.fromLines([line], TEST_SCHEMA_V2);
    const loaded = await store.load();
    expect(loaded.lines).toEqual([line]);
    expect(loaded.events[0]?.schema_version).toBe(2);
    expect((loaded.events[0] as { notes?: string }).notes).toBe("x");
  });
});
