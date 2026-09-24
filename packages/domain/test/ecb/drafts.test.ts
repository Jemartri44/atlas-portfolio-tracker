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
    await recordPendingDraft(deps, { ...drafts, remove: async () => {} } as never, draft, event);
    expect(drafts.saved.size).toBe(1);
    // Confirming it again is refused by the fingerprint, and the draft stays.
    await expect(recordPendingDraft(deps, drafts, draft, event)).rejects.toBeInstanceOf(
      DuplicateFingerprintError,
    );
    expect(drafts.saved.size).toBe(1);
  });
});

describe("draftRecordedAs (review of PR #75)", () => {
  it("finds the confirmation whose removal of the draft did not happen, and nothing else", async () => {
    const store = seeded();
    const deps = testDeps(store);
    const { draft } = await preparePendingDraft(deps, history, 30, goldBuy);
    const project = async () => {
      const { events: now } = await store.load();
      return { state: projectLedger(now), now };
    };
    let { state, now } = await project();
    expect(draftRecordedAs(state, now, draft)).toEqual([]);
    // Confirmed, and the store of drafts failed to remove it.
    const result = await recordPendingDraft(
      deps,
      { ...new MemoryDrafts(), remove: async () => {} } as never,
      draft,
      { ...goldBuy, fx_rate: "1.1104", fx_rate_date: "2026-04-01" },
    );
    ({ state, now } = await project());
    expect(draftRecordedAs(state, now, draft)).toEqual([result.event.id]);
    // An identical operation recorded before the draft was saved is another one.
    expect(draftRecordedAs(state, now, { ...draft, saved_at: "2099-01-01T00:00:00.000Z" })).toEqual(
      [],
    );
    // A draft without a fingerprint of its own matches nothing.
    expect(draftRecordedAs(state, now, { ...draft, event: { type: "valuation" } })).toEqual([]);
  });
});
