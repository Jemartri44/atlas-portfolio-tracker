// The draft of an operation recorded before its ECB rate is published
// (ADR-0029, point 9; block 5 of prompt 012; mutant 12 of §5).

import { describe, expect, it } from "vitest";
import {
  DRAFT_FORMAT,
  draftRecordedAs,
  type PendingDraft,
  parsePendingDraft,
  pendingDraftStatus,
  preparePendingDraft,
  recordPendingDraft,
  serializePendingDraft,
} from "../../src/ecb/drafts.js";
import { readEcbZipCsv } from "../../src/ecb/history.js";
import { DuplicateFingerprintError, ValidationError } from "../../src/errors.js";
import type { PendingDraftStore } from "../../src/ports/draft-store.js";
import { cashBalances } from "../../src/projections/cash.js";
import { physicalPositions } from "../../src/projections/positions.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { recordEvent } from "../../src/usecases/record-event.js";
import { ecbFixture } from "../fixtures-path.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { testDeps } from "../usecases/helpers.js";

const text = ecbFixture("eurofxref-hist.csv");
/** The fixture reaches 2026-03-31, a Tuesday. */
const history = readEcbZipCsv(text);

/** The same history, one working day later: 2026-04-01 published, dollar at 1.1104. */
const later = (() => {
  const [header, newest, ...rest] = text.split("\n");
  const next = (newest as string).replace("2026-03-31,1.1091,", "2026-04-01,1.1104,");
  return readEcbZipCsv([header, next, newest, ...rest].join("\n"));
})();

/** A purchase of gold (an ETC: fiscal date = trade date) on a day not published yet. */
const goldBuy = {
  type: "buy",
  account_id: "acc_etf",
  asset_id: "ast_gold",
  trade_date: "2026-04-01",
  value_date: "2026-04-03",
  quantity: "1",
  unit_price: "100",
  currency: "USD",
  fee: "0",
  source: "manual",
};

const events = (() => {
  const builder = new LedgerBuilder();
  catalogue(builder);
  return builder.build();
})();

const seeded = (): TestStore => new TestStore(events);

class MemoryDrafts implements PendingDraftStore {
  readonly saved = new Map<string, PendingDraft>();
  async list() {
    return { drafts: [...this.saved.values()], unreadable: [] };
  }
  async save(draft: PendingDraft) {
    this.saved.set(draft.id, draft);
  }
  async update(draft: PendingDraft) {
    this.saved.set(draft.id, draft);
  }
  async remove(id: string) {
    this.saved.delete(id);
  }
}

describe("preparePendingDraft", () => {
  it("keeps the operation as it came, without inventing a rate", async () => {
    const store = seeded();
    const deps = testDeps(store);
    const { draft, duplicates } = await preparePendingDraft(deps, history, 30, goldBuy);
    expect(draft.draft_format).toBe(DRAFT_FORMAT);
    expect(draft.event).toEqual(goldBuy);
    expect(draft.event).not.toHaveProperty("fx_rate");
    expect(draft.event).not.toHaveProperty("fx_rate_date");
    expect(draft.saved_at).toBe("2027-08-30T10:00:00.000Z");
    expect(duplicates).toEqual([]);
    // Preparing writes nothing to the ledger.
    expect((await store.load()).lines).toHaveLength((await seeded().load()).lines.length);
  });

  it("runs the ledger's own check on everything but the rate", async () => {
    const deps = testDeps(seeded());
    // Selling what is not there is refused as a record refuses it.
    await expect(
      preparePendingDraft(deps, history, 30, { ...goldBuy, type: "sell", quantity: "5" }),
    ).rejects.toMatchObject({ code: "insufficient_position" });
    // A missing field is still missing: the ledger's validation is not loosened.
    const { quantity: _quantity, ...incomplete } = goldBuy;
    await expect(preparePendingDraft(deps, history, 30, incomplete)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("is not needed when no rate waits for the ECB", async () => {
    const deps = testDeps(seeded());
    const published = { ...goldBuy, trade_date: "2026-03-31" };
    await expect(preparePendingDraft(deps, history, 30, published)).rejects.toMatchObject({
      code: "draft_not_needed",
    });
    // Nor without a history: then the rate is typed as always.
    await expect(preparePendingDraft(deps, undefined, 30, goldBuy)).rejects.toMatchObject({
      code: "draft_not_needed",
    });
    // Nor when the user typed half of it: only a pair nobody typed waits
    // (review of PR #75) — the half typed is the user's, and the ledger's
    // validation says what is missing.
    await expect(
      preparePendingDraft(deps, history, 30, { ...goldBuy, fx_rate_date: "2026-04-01" }),
    ).rejects.toMatchObject({ code: "draft_not_needed" });
    await expect(
      preparePendingDraft(deps, history, 30, { ...goldBuy, fx_rate: "1.11" }),
    ).rejects.toMatchObject({ code: "draft_not_needed" });
    // Nor when the user typed the rate.
    await expect(
      preparePendingDraft(deps, history, 30, {
        ...goldBuy,
        fx_rate: "1.11",
        fx_rate_date: "2026-04-01",
      }),
    ).rejects.toMatchObject({ code: "draft_not_needed" });
  });

  it("says the duplicates a record would say", async () => {
    const store = seeded();
    const deps = testDeps(store);
    await recordPendingDraft(
      deps,
      new MemoryDrafts(),
      (await preparePendingDraft(deps, history, 30, goldBuy)).draft,
      {
        ...goldBuy,
        fx_rate: "1.1104",
        fx_rate_date: "2026-04-01",
      },
    );
    const again = await preparePendingDraft(deps, history, 30, goldBuy);
    expect(again.duplicates).toHaveLength(1);
  });

  it("copies the effects before standing in for their rates", async () => {
    const store = seeded();
    const deps = testDeps(store);
    const action = {
      type: "corporate_action",
      asset_id: "ast_gold",
      kind: "spin_off",
      effective_date: "2026-04-01",
      source_url: "https://example.org/notice",
      effects: [
        {
          op: "grant",
          asset_id: "ast_spec",
          account_id: "acc_etf",
          quantity: "1",
          cost: "10",
          currency: "USD",
          acquisition_date: "2026-04-01",
        },
      ],
    };
    // Whatever the ledger says of the action itself, the draft saved is the one given.
    const outcome = await preparePendingDraft(deps, history, 30, action).catch(
      (error: unknown) => error,
    );
    expect(action.effects[0]).not.toHaveProperty("fx_rate");
    expect(outcome).not.toMatchObject({ code: "draft_not_needed" });
  });
});

describe("parsePendingDraft", () => {
  it("reads back what it wrote", async () => {
    const deps = testDeps(seeded());
    const { draft } = await preparePendingDraft(deps, history, 30, goldBuy);
    expect(parsePendingDraft(serializePendingDraft(draft))).toEqual(draft);
    expect(serializePendingDraft(draft).endsWith("}\n")).toBe(true);
  });

  it("refuses what it does not understand", () => {
    const code = (text: string) => {
      try {
        parsePendingDraft(text);
        return "read";
      } catch (error) {
        return (error as ValidationError).code;
      }
    };
    expect(code("{")).toBe("draft_unreadable");
    expect(code("[]")).toBe("draft_unreadable");
    expect(code("null")).toBe("draft_unreadable");
    expect(code(JSON.stringify({ draft_format: 2 }))).toBe("draft_unreadable");
    const good = {
      draft_format: 1,
      id: "01K00000000000000000000000",
      saved_at: "2026-04-01T10:00:00.000Z",
      event: goldBuy,
    };
    expect(code(JSON.stringify(good))).toBe("read");
    expect(code(JSON.stringify({ ...good, id: "x" }))).toBe("draft_unreadable");
    expect(code(JSON.stringify({ ...good, saved_at: 1 }))).toBe("draft_unreadable");
    expect(code(JSON.stringify({ ...good, event: [] }))).toBe("draft_unreadable");
    expect(code(JSON.stringify({ ...good, event: { type: 1 } }))).toBe("draft_unreadable");
  });
});

describe("pendingDraftStatus", () => {
  const state = projectLedger(events);
  const draft: PendingDraft = {
    draft_format: 1,
    id: "01K00000000000000000000000",
    saved_at: "2026-04-01T10:00:00.000Z",
    event: goldBuy,
  };

  it("waits while the ECB has not published, and without a history", () => {
    expect(pendingDraftStatus(undefined, state, draft, 30)).toEqual({ kind: "no_history" });
    expect(pendingDraftStatus(history, state, draft, 30)).toEqual({
      kind: "waiting",
      rates: [{ currency: "USD", reference: "2026-04-01", latest: "2026-03-31" }],
    });
  });

  it("is confirmable with the official rate in place once published, and records nothing", () => {
    const status = pendingDraftStatus(later, state, draft, 30);
    expect(status.kind).toBe("confirmable");
    expect(status.kind === "confirmable" && status.event).toEqual({
      ...goldBuy,
      fx_rate: "1.1104",
      fx_rate_date: "2026-04-01",
    });
    // The draft itself is untouched: the proposal is a new object.
    expect(draft.event).not.toHaveProperty("fx_rate");
  });

  it("needs a typed rate when the ECB will not publish it", () => {
    const lev = { ...draft, event: { ...goldBuy, currency: "BGN" } };
    expect(pendingDraftStatus(history, state, lev, 30)).toEqual({
      kind: "needs_rate",
      currencies: ["BGN"],
    });
  });
});

describe("a draft is not a fact (mutant 12)", () => {
  it("counts in no position, no cash and no projection until it is recorded", async () => {
    const store = seeded();
    const deps = testDeps(store);
    const drafts = new MemoryDrafts();
    const before = projectLedger((await store.load()).events);
    const { draft } = await preparePendingDraft(deps, history, 30, goldBuy);
    await drafts.save(draft);
    const after = projectLedger((await store.load()).events);
    expect(physicalPositions(after)).toEqual(physicalPositions(before));
    expect(cashBalances(after)).toEqual(cashBalances(before));
    // The rate arrives: nothing is written until somebody records it.
    expect(pendingDraftStatus(later, after, draft, 30).kind).toBe("confirmable");
    expect((await store.load()).lines).toEqual((await seeded().load()).lines);
    expect(drafts.saved.size).toBe(1);
  });
});

describe("recordPendingDraft", () => {
  it("records first and removes the draft after", async () => {
    const store = seeded();
    const deps = testDeps(store);
    const drafts = new MemoryDrafts();
    const { draft } = await preparePendingDraft(deps, history, 30, goldBuy);
    await drafts.save(draft);
    const state = projectLedger((await store.load()).events);
    const status = pendingDraftStatus(later, state, draft, 30);
    if (status.kind !== "confirmable") {
      throw new Error("expected a confirmable draft");
    }
    const result = await recordPendingDraft(deps, drafts, draft, status.event);
    expect(result.event).toMatchObject({ fx_rate: "1.1104", fx_rate_date: "2026-04-01" });
    expect(drafts.saved.size).toBe(0);
  });

  it("keeps the draft when the record is refused, and a second record is a duplicate", async () => {
    const store = seeded();
    const deps = testDeps(store);
    const drafts = new MemoryDrafts();
    const { draft } = await preparePendingDraft(deps, history, 30, goldBuy);
    await drafts.save(draft);
    const event = { ...goldBuy, fx_rate: "1.1104", fx_rate_date: "2026-04-01" };
    // A cut between recording and removing: the operation is in both places.
    await recordPendingDraft(
      deps,
      {
        ...drafts,
        update: (next: PendingDraft) => drafts.update(next),
        remove: async () => {},
      } as never,
      draft,
      event,
    );
    expect(drafts.saved.size).toBe(1);
    // Confirming it again with its stamped id is refused — the id is in the
    // ledger already —, and the draft stays for the interface to remove.
    await expect(
      recordPendingDraft(deps, drafts, drafts.saved.get(draft.id) as PendingDraft, event),
    ).rejects.toBeDefined();
    expect(drafts.saved.size).toBe(1);
  });
});

describe("a confirmation retried knows its own line, and nothing else (second review of PR #75)", () => {
  const confirmed = { ...goldBuy, fx_rate: "1.1104", fx_rate_date: "2026-04-01" };

  it("keeps a draft whose twin was recorded by hand, and asks the duplicate question", async () => {
    // The reviewer's case: a draft of 1 ast_gold, then an identical purchase
    // recorded by hand. Confirming must not take the draft for recorded.
    const store = seeded();
    const deps = testDeps(store);
    const drafts = new MemoryDrafts();
    const { draft } = await preparePendingDraft(deps, history, 30, goldBuy);
    await drafts.save(draft);
    await recordEvent(deps, confirmed as never);
    expect(draftRecordedAs((await store.load()).events, draft)).toEqual([]);
    await expect(recordPendingDraft(deps, drafts, draft, confirmed)).rejects.toBeInstanceOf(
      DuplicateFingerprintError,
    );
    expect([...drafts.saved.keys()]).toEqual([draft.id]);
    // Said yes to the question, it is recorded: two purchases, as there were.
    const second = await recordPendingDraft(
      deps,
      drafts,
      drafts.saved.get(draft.id) as PendingDraft,
      confirmed,
      {
        confirmDuplicate: true,
      },
    );
    expect(second.draftRemoved).toBe(true);
    const state = projectLedger((await store.load()).events);
    expect(
      physicalPositions(state)
        .find((row) => row.asset_id === "ast_gold")
        ?.quantity.toString(),
    ).toBe("2");
  });

  it("stamps the id before writing, writes with it, and a retry after a cut finds exactly it", async () => {
    const store = seeded();
    const deps = testDeps(store);
    const drafts = new MemoryDrafts();
    const { draft } = await preparePendingDraft(deps, history, 30, goldBuy);
    await drafts.save(draft);
    expect(draftRecordedAs((await store.load()).events, draft)).toEqual([]);
    // The cut: the store of drafts fails once the line is written. And the
    // stamp is written **before** the line: at that moment the ledger has
    // not grown yet.
    const before = (await store.load()).lines.length;
    const linesWhenStamped: number[] = [];
    const failing = {
      ...drafts,
      update: async (next: PendingDraft) => {
        linesWhenStamped.push((await store.load()).lines.length);
        await drafts.update(next);
      },
      remove: async () => {
        throw new Error("disco lleno");
      },
    };
    const result = await recordPendingDraft(deps, failing as never, draft, confirmed);
    expect(result.draftRemoved).toBe(false);
    expect(linesWhenStamped).toEqual([before]);
    const stamped = drafts.saved.get(draft.id) as PendingDraft;
    expect(stamped.pending_event_id).toBe(result.event.id);
    expect(draftRecordedAs((await store.load()).events, stamped)).toEqual([result.event.id]);
    // The stamp survives a retry that is refused: the id never changes.
    await expect(recordPendingDraft(deps, drafts, stamped, confirmed)).rejects.toBeDefined();
    expect(drafts.saved.get(draft.id)?.pending_event_id).toBe(result.event.id);
  });

  it("reads and writes the stamp in the file of a draft", () => {
    const stamped: PendingDraft = {
      draft_format: 1,
      id: "01K00000000000000000000000",
      saved_at: "2026-04-01T10:00:00.000Z",
      event: goldBuy,
      pending_event_id: "01K00000000000000000000001",
    };
    expect(parsePendingDraft(serializePendingDraft(stamped))).toEqual(stamped);
    expect(() => parsePendingDraft(JSON.stringify({ ...stamped, pending_event_id: "x" }))).toThrow(
      ValidationError,
    );
  });
});
