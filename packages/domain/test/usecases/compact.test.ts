import { describe, expect, it } from "vitest";
import { ArchiveExistsError, CompactRejectedError, ConflictError } from "../../src/errors.js";
import type { LedgerStore, LoadedLedger } from "../../src/ports/ledger-store.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { snapshotOf } from "../../src/projections/snapshot.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { decodeLine, encodeLine } from "../../src/schema/line.js";
import type { LedgerSchema } from "../../src/schema/migrations/index.js";
import { archiveNameFor, compactLedger, planCompact } from "../../src/usecases/compact.js";
import { fixtureLines } from "../fixtures-path.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { TEST_SCHEMA_V2 } from "../schema/test-schema.js";

const clock = { now: () => new Date("2028-01-15T10:00:00.000Z") };
const legacy = fixtureLines("legacy-v1-for-test-schema.jsonl");

/** Legacy v1 lines plus events already written in v2 (a fund transfer request on the legacy fund). */
const mixedStore = (): TestStore => {
  const b = new LedgerBuilder(100);
  const request = b.transferRequested({
    from_account_id: "acc_legacy",
    from_asset_id: "ast_legacy",
    to_account_id: "acc_legacy",
    to_asset_id: "ast_legacy_b",
    quantity_out: "4",
    requested_date: "2027-03-01",
  });
  const asset = b.asset("ast_legacy_b", { asset_class: "equity" });
  const v2 = [request, asset].map((event) => ({ ...event, schema_version: 2 }));
  return TestStore.fromLines([...legacy, ...v2.map(encodeLine)], TEST_SCHEMA_V2);
};

describe("planCompact + compactLedger", () => {
  it("rewrites a mixed ledger to the current version, archives the original and keeps the snapshot", async () => {
    const store = mixedStore();
    const original = store.text();
    const before = snapshotOf(projectLedger((await store.load()).events));
    const plan = await planCompact({ store, clock });
    expect(plan).toEqual({
      etag: "0",
      lines: 6,
      versions: [
        { version: 1, lines: 4 },
        { version: 2, lines: 2 },
      ],
      targetVersion: 2,
      outdated: 4,
      archiveName: "ledger-2028-01-15-v1.jsonl",
    });
    const result = await compactLedger({ store, clock }, plan);
    expect(result).toEqual({
      status: "compacted",
      archiveName: "ledger-2028-01-15-v1.jsonl",
      linesBefore: 6,
      linesAfter: 6,
      versions: plan.versions,
      targetVersion: 2,
      etag: "1",
    });
    expect(store.archives.get("ledger-2028-01-15-v1.jsonl")).toBe(original);
    const reloaded = await store.load();
    expect(reloaded.lines.every((line) => line.startsWith('{"schema_version":2,'))).toBe(true);
    expect(reloaded.lines.some((line) => line.includes('"note":'))).toBe(false);
    expect(reloaded.lines.filter((line) => line.includes('"notes":'))).toHaveLength(2);
    expect(JSON.stringify(snapshotOf(projectLedger(reloaded.events)))).toBe(JSON.stringify(before));

    const second = await planCompact({ store, clock });
    expect(second.outdated).toBe(0);
    expect(await compactLedger({ store, clock }, second)).toEqual({
      status: "nothing_to_compact",
      lines: 6,
      versions: [{ version: 2, lines: 6 }],
      targetVersion: 2,
    });
    expect(store.archives.size).toBe(1);
  });

  it("is a no-op on an empty ledger and on a ledger already at the current version", async () => {
    const empty = new TestStore();
    const emptyPlan = await planCompact({ store: empty, clock });
    expect(emptyPlan.archiveName).toBe("ledger-2028-01-15-v1.jsonl");
    expect(await compactLedger({ store: empty, clock }, emptyPlan)).toEqual({
      status: "nothing_to_compact",
      lines: 0,
      versions: [],
      targetVersion: 1,
    });
    const b = new LedgerBuilder();
    catalogue(b);
    const current = new TestStore(b.build());
    const plan = await planCompact({ store: current, clock });
    expect(plan.outdated).toBe(0);
    expect((await compactLedger({ store: current, clock }, plan)).status).toBe(
      "nothing_to_compact",
    );
    expect(current.archives.size).toBe(0);
  });

  it("refuses a ledger with invalid events without touching it", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_none", asset_id: "ast_world" });
    const store = TestStore.fromLines(b.build().map(encodeLine), TEST_SCHEMA_V2);
    const error = await planCompact({ store, clock }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CompactRejectedError);
    expect((error as CompactRejectedError).code).toBe("invalid_events");
    expect((error as CompactRejectedError).details.affected).toEqual([
      { id: b.build()[7]?.id, type: "buy", error: "account acc_none does not exist" },
    ]);
    expect(store.archives.size).toBe(0);
  });

  it("refuses to run when the ledger changed after planning", async () => {
    const store = mixedStore();
    const plan = await planCompact({ store, clock });
    const { etag } = await store.load();
    await store.append([{ ...new LedgerBuilder(200).account("acc_x"), schema_version: 2 }], etag);
    await expect(compactLedger({ store, clock }, plan)).rejects.toBeInstanceOf(ConflictError);
    expect(store.archives.size).toBe(0);
    expect((await store.load()).lines).toHaveLength(7);
  });

  it("never overwrites an archive: tries -2, -3… and gives up after 99", async () => {
    const store = mixedStore();
    const original = store.text();
    const { etag } = await store.load();
    await store.replace((await store.load()).events, etag, "ledger-2028-01-15-v1.jsonl");
    const again = mixedStore();
    for (const [name, text] of store.archives) {
      again.archives.set(name, text);
    }
    const plan = await planCompact({ store: again, clock });
    const result = await compactLedger({ store: again, clock }, plan);
    expect(result.status === "compacted" && result.archiveName).toBe(
      "ledger-2028-01-15-v1-2.jsonl",
    );
    expect(again.archives.get("ledger-2028-01-15-v1-2.jsonl")).toBe(original);

    const exhausted = mixedStore();
    for (let attempt = 1; attempt <= 99; attempt += 1) {
      exhausted.archives.set(archiveNameFor("2028-01-15", 1, attempt), "taken");
    }
    const full = await planCompact({ store: exhausted, clock });
    await expect(compactLedger({ store: exhausted, clock }, full)).rejects.toBeInstanceOf(
      ArchiveExistsError,
    );
    expect((await exhausted.load()).lines).toEqual([
      ...legacy,
      ...(await mixedStore().load()).lines.slice(4),
    ]);
  });

  it("aborts without writing when the rewritten text projects differently", async () => {
    // A store whose loader does not migrate although its schema would: the rewritten
    // v1 lines get migrated on re-read and the projection changes. Nothing is written.
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_fund" });
    const events = b.build();
    const doubling: LedgerSchema = {
      version: 2,
      migrations: new Map([
        [1, (line) => (line.type === "cash_deposit" ? { ...line, amount: "10000" } : line)],
      ]),
    };
    let replaced = false;
    const lying: LedgerStore = {
      schema: doubling,
      load: async (): Promise<LoadedLedger> => ({
        events,
        etag: "0",
        lines: events.map(encodeLine),
      }),
      append: () => Promise.reject(new Error("unused")),
      replace: async () => {
        replaced = true;
        return { etag: "1" };
      },
    };
    const plan = await planCompact({ store: lying, clock });
    expect(plan.outdated).toBe(events.length);
    const error = await compactLedger({ store: lying, clock }, plan).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CompactRejectedError);
    expect((error as CompactRejectedError).code).toBe("projection_changed");
    expect((error as CompactRejectedError).details.keys).toEqual(["cash"]);
    expect(replaced).toBe(false);
    // Sanity: the same lines decode differently under that schema.
    const line = encodeLine(events[events.length - 1] as LedgerEvent);
    expect((decodeLine(line, doubling).event as { amount: string }).amount).toBe("10000");
  });

  it("names archives by date, lowest version and attempt", () => {
    expect(archiveNameFor("2028-01-15", 1)).toBe("ledger-2028-01-15-v1.jsonl");
    expect(archiveNameFor("2028-01-15", 1, 3)).toBe("ledger-2028-01-15-v1-3.jsonl");
  });
});
