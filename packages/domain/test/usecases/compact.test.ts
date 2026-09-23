import { describe, expect, it } from "vitest";
import { ArchiveExistsError, CompactRejectedError, ConflictError } from "../../src/errors.js";
import { checkFilingFingerprints, fingerprintOfEvents } from "../../src/filings/fingerprint.js";
import type { LedgerStore, LoadedLedger } from "../../src/ports/ledger-store.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { snapshotOf } from "../../src/projections/snapshot.js";
import type { LedgerEvent, TaxReturnFiledEvent } from "../../src/schema/events.js";
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
      // Nothing unverifiable, which is the normal case and the fast path.
      unverified: [],
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

describe("compact and the fingerprints of the filings (ADR-0020)", () => {
  /** The legacy v1 lines plus a filing sealed over exactly those. */
  const withFiling = (): { store: TestStore; filingId: string } => {
    const b = new LedgerBuilder(200);
    // A client of version 1 sealed it, over the lines as version 1 writes them:
    // the case the reseal exists for, because compacting raises them to 2.
    const beforeFiling = legacy.map((line) => decodeLine(line).event);
    const filing = b.filed({
      tax_year: 2027,
      ledger_fingerprint: fingerprintOfEvents(beforeFiling, 1),
    });
    return {
      store: TestStore.fromLines([...legacy, encodeLine(filing)], TEST_SCHEMA_V2),
      filingId: filing.id,
    };
  };

  it("verifies every fingerprint, rewrites the lines and seals them again at the new version", async () => {
    const { store, filingId } = withFiling();
    const sealedAtV1 = (
      (await store.load()).events.find((event) => event.id === filingId) as TaxReturnFiledEvent
    ).ledger_fingerprint.sha256;
    const plan = await planCompact({ store, clock });
    expect(plan.outdated).toBeGreaterThan(0);
    const result = await compactLedger({ store, clock }, plan);
    expect(result.status).toBe("compacted");
    const { events, lines } = await store.load();
    const filing = events.find((event) => event.id === filingId) as TaxReturnFiledEvent;
    // Sealed again at the version the file now carries, over the same count of
    // lines, and it verifies against the rewritten file.
    expect(filing.ledger_fingerprint.schema_version).toBe(2);
    expect(filing.ledger_fingerprint.lines).toBe(legacy.length);
    // The digest moved, because the content of those lines is now version 2.
    expect(filing.ledger_fingerprint.sha256).not.toBe(sealedAtV1);
    expect(
      checkFilingFingerprints(lines, events, TEST_SCHEMA_V2).map((check) => check.reason),
    ).toEqual([undefined]);
  });

  it("refuses to compact a ledger whose filing no longer matches what precedes it", async () => {
    const { store } = withFiling();
    const plan = await planCompact({ store, clock });
    // A line before the filing, edited by hand after it was sealed.
    const tampered = TestStore.fromLines(
      (await store.load()).lines.map((line, index) =>
        index === 1 ? line.replace(/"name":"([^"]*)"/, '"name":"Editado"') : line,
      ),
      TEST_SCHEMA_V2,
    );
    try {
      await compactLedger({ store: tampered, clock }, plan);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CompactRejectedError);
      expect((error as CompactRejectedError).code).toBe("filing_fingerprint_mismatch");
    }
    // Nothing was written: no archive, and the text is the one it had.
    expect(tampered.archives.size).toBe(0);
  });

  /** The same ledger, with the line before the filing edited after it was sealed. */
  const tamperedStore = async () => {
    const { store, filingId } = withFiling();
    const plan = await planCompact({ store, clock });
    const tampered = TestStore.fromLines(
      (await store.load()).lines.map((line, index) =>
        index === 1 ? line.replace(/"name":"([^"]*)"/, '"name":"Editado"') : line,
      ),
      TEST_SCHEMA_V2,
    );
    return { tampered, plan, filingId };
  };

  /**
   * **Compacting is the only way of migrating the ledger to a new schema
   * version**, so a ledger that cannot be compacted is frozen forever — a
   * failure of survival over twenty years, worse than anything the fingerprint
   * protects against, and the only way round it left to the user is editing
   * the `.jsonl` by hand, which is exactly what the fingerprint exists to
   * detect (ADR-0025).
   */
  it("lets the user accept one unverifiable fingerprint by name, and records it", async () => {
    const { tampered, plan, filingId } = await tamperedStore();
    const result = await compactLedger({ store: tampered, clock }, plan, {
      acceptUnverified: [filingId],
    });
    expect(result.status).toBe("compacted");
    const { events } = await tampered.load();
    const waiver = events.find((event) => event.type === "filing_fingerprint_waived") as {
      filing_id: string;
      reason: string;
      declared_schema_version: number;
      declared_lines: number;
    };
    expect(waiver.filing_id).toBe(filingId);
    // The reason, never the two under one word: the figures do not add up, as
    // against not being readable at all.
    expect(waiver.reason).toBe("digest");
    // What the fingerprint declared: after compacting the ledger holds it
    // nowhere else, because resealing overwrote it.
    expect(waiver.declared_schema_version).toBe(1);
    expect(waiver.declared_lines).toBe(legacy.length);
  });

  it("does not let a waiver of one filing authorise another", async () => {
    const { tampered, plan } = await tamperedStore();
    const error = await compactLedger({ store: tampered, clock }, plan, {
      acceptUnverified: ["01ARYZ6S41TSV4RRFFQ69G5OTR"],
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CompactRejectedError);
    expect((error as CompactRejectedError).code).toBe("filing_fingerprint_mismatch");
    expect(tampered.archives.size).toBe(0);
  });

  it("still refuses by default: nobody compacts a broken fingerprint by accident", async () => {
    const { tampered, plan } = await tamperedStore();
    const error = await compactLedger({ store: tampered, clock }, plan).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CompactRejectedError);
    expect(tampered.archives.size).toBe(0);
  });

  /**
   * **The waiver and the compaction are all or nothing** (ADR-0025, condition
   * of the direction). A waiver written without its compaction would be a line
   * stating a fact that did not happen — a fingerprint given up that was never
   * actually skipped — and in an append-only ledger it could not be taken
   * back.
   *
   * The store below fails **at `replace`**, which is after the point where the
   * waiver is built and the only thing that writes: either the whole file is
   * replaced, waiver inside, or nothing is.
   */
  it("names in the plan what it could not verify, so the caller can decide", async () => {
    const { tampered, filingId } = await tamperedStore();
    const plan = await planCompact({ store: tampered, clock });
    expect(plan.unverified).toEqual([{ filing_id: filingId, reason: "digest" }]);
  });

  it("names the reason of the refusal, because only one of the two accuses anybody", async () => {
    // A line before the filing written at a version its fingerprint does not
    // know: the prefix cannot be **read**, which is not an edit, and no backup
    // fixes it. Refusing under the same code as "edited by hand" would accuse
    // the user of something that did not happen (feature 011, decision (g)).
    const { store, filingId } = withFiling();
    const plan = await planCompact({ store, clock });
    const newer = TestStore.fromLines(
      (await store.load()).lines.map((line, index) =>
        index === 1 ? JSON.stringify({ ...JSON.parse(line), schema_version: 2 }) : line,
      ),
      TEST_SCHEMA_V2,
    );
    const error = await compactLedger({ store: newer, clock }, plan).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CompactRejectedError);
    expect((error as CompactRejectedError).code).toBe("filing_fingerprint_unreadable");
    // And it can be accepted like the other one, with its own reason recorded.
    const accepted = await compactLedger({ store: newer, clock }, plan, {
      acceptUnverified: [filingId],
    });
    expect(accepted.status).toBe("compacted");
    const waiver = (await newer.load()).events.find(
      (event) => event.type === "filing_fingerprint_waived",
    ) as { reason: string };
    expect(waiver.reason).toBe("unreadable");
  });

  it("writes no waiver when the compaction does not go through", async () => {
    const { tampered, plan, filingId } = await tamperedStore();
    const before = (await tampered.load()).lines;
    const failing: LedgerStore = {
      schema: tampered.schema,
      load: () => tampered.load(),
      append: (events, etag) => tampered.append(events, etag),
      replace: () => {
        throw new ArchiveExistsError("ledger-2027-v1.jsonl");
      },
    };
    await expect(
      compactLedger({ store: failing, clock }, plan, { acceptUnverified: [filingId] }),
    ).rejects.toBeInstanceOf(ArchiveExistsError);
    const { lines, events } = await tampered.load();
    expect(lines).toEqual(before);
    expect(events.some((event) => event.type === "filing_fingerprint_waived")).toBe(false);
  });
});
