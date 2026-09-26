// Feature 015, E3, block 5, points 4 and 5 (§7 P6, option (a); §7.1 bis, N1):
// redoing registers with the rule of `correctEvent` — refused only for what
// it itself leaves invalid — through a function of its own that takes the
// **sealed plan** and checks the event carries exactly its id. Outside the
// redo, `recordEvent` does not change.

import { describe, expect, it } from "vitest";
import {
  DependentEventsError,
  DuplicateFingerprintError,
  InvalidLedgerError,
  NotFoundError,
  ProjectionError,
  ValidationError,
} from "../../src/errors.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { Draft, LedgerEvent, SupportedEvent } from "../../src/schema/events.js";
import { recordRedo } from "../../src/sync/redo-record.js";
import type { RedoPlan } from "../../src/sync/resolve.js";
import { completeDraft, recordEvent } from "../../src/usecases/record-event.js";
import { correctEvent } from "../../src/usecases/rectify.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { testDeps } from "../usecases/helpers.js";

const SEALED = "01ARYZ6S41TSV4RRFFQ69SEAB1";
const OTHER = "01ARYZ6S41TSV4RRFFQ69ZZZZ0";
const NONE = "01ARYZ6S41TSV4RRFFQ69NNNN0";

const draftOf = <E extends SupportedEvent>(event: E): Draft<E> => {
  const {
    schema_version: _v,
    id: _id,
    recorded_at: _at,
    fingerprint: _fp,
    ...rest
  } = event as E & { fingerprint?: string };
  return rest as unknown as Draft<E>;
};

/**
 * A ledger already invalid: a purchase of 10, a sale of 1 and a sale of 20
 * the position does not cover (as a held pair can leave it, D-Q1).
 */
const invalidLedger = () => {
  const builder = new LedgerBuilder();
  catalogue(builder);
  const buy = builder.buy({ account_id: "acc_fund", asset_id: "ast_world" });
  const small = builder.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "1" });
  const sell = builder.sell({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "20",
    trade_date: "2027-07-10",
  });
  const events = builder.build();
  expect(
    projectLedger(events, { collectErrors: true }).invalid.map((entry) => entry.event.id),
  ).toEqual([sell.id]);
  return { events, buy, small, sell };
};

/** The ids a correction is written with, as `sealedIds` hands them. */
const idsOf = (...ids: string[]) => ({ next: () => ids.shift() ?? "" });

const depositPlan = (): Extract<RedoPlan, { kind: "record" }> => ({
  kind: "record",
  draft: {
    type: "cash_deposit",
    account_id: "acc_fund",
    value_date: "2027-02-01",
    fx_rate_date: "2027-01-29",
    amount: "700",
    currency: "EUR",
    fx_rate: "1",
  } as never,
  id: SEALED,
});

describe("correctEvent on a ledger that is already invalid (point 5)", () => {
  it("corrects an event while another is invalid: only what it breaks counts", async () => {
    const { events, buy } = invalidLedger();
    const store = new TestStore(events);
    await correctEvent(testDeps(store), buy.id, { ...draftOf(buy), unit_price: "110" }, "typo", {
      ids: idsOf(OTHER, SEALED),
    });
    expect((await store.load()).events.map((event) => event.id).slice(-2)).toEqual([OTHER, SEALED]);
  });

  it("still refuses a correction that leaves itself invalid", async () => {
    const { events, small } = invalidLedger();
    const store = new TestStore(events);
    await expect(
      correctEvent(testDeps(store), small.id, { ...draftOf(small), quantity: "30" }, "typo", {
        ids: idsOf(OTHER, SEALED),
      }),
    ).rejects.toBeInstanceOf(ProjectionError);
    expect((await store.load()).events).toHaveLength(events.length);
  });
});

describe("recordRedo (point 4; N1; mutant 33 bis)", () => {
  it("records the redo over a ledger left invalid by a held pair, where recordEvent refuses (D-Q1)", async () => {
    const { events } = invalidLedger();
    const store = new TestStore(events);
    const deps = testDeps(store);
    const plan = depositPlan();
    await expect(recordEvent(deps, plan.draft, { id: SEALED })).rejects.toBeInstanceOf(
      InvalidLedgerError,
    );
    const event = completeDraft(deps, plan.draft, plan.id);
    const result = await recordRedo(deps, plan, event);
    expect(result.event.id).toBe(SEALED);
    expect((await store.load()).events.at(-1)?.id).toBe(SEALED);
  });

  it("refuses an event that does not carry the sealed id, writing nothing", async () => {
    const { events } = invalidLedger();
    const store = new TestStore(events);
    const deps = testDeps(store);
    const plan = depositPlan();
    const other = completeDraft(deps, plan.draft, OTHER);
    await expect(recordRedo(deps, plan, other)).rejects.toMatchObject({
      code: "redo_id_mismatch",
      details: { expected: SEALED, id: OTHER },
    });
    expect((await store.load()).events).toHaveLength(events.length);
  });

  it("refuses an event of another type than the plan's draft", async () => {
    const { events } = invalidLedger();
    const store = new TestStore(events);
    const deps = testDeps(store);
    const event = completeDraft(
      deps,
      {
        type: "cash_withdrawal",
        account_id: "acc_fund",
        value_date: "2027-02-01",
        fx_rate_date: "2027-01-29",
        amount: "1",
        currency: "EUR",
        fx_rate: "1",
      } as never,
      SEALED,
    );
    await expect(recordRedo(deps, depositPlan(), event)).rejects.toMatchObject({
      code: "redo_type_mismatch",
    });
    expect((await store.load()).events).toHaveLength(events.length);
  });

  it("refuses for what it itself leaves invalid", async () => {
    const { events, small } = invalidLedger();
    const store = new TestStore(events);
    const deps = testDeps(store);
    const plan: RedoPlan = {
      kind: "record",
      draft: {
        ...draftOf(small),
        quantity: "50",
        trade_date: "2027-08-01",
        value_date: "2027-08-01",
      },
      id: SEALED,
    };
    await expect(
      recordRedo(deps, plan, completeDraft(deps, plan.draft, SEALED)),
    ).rejects.toBeInstanceOf(ProjectionError);
    expect((await store.load()).events).toHaveLength(events.length);
  });

  it("records a lone reversal on its target, and refuses a target that is not there", async () => {
    const { events, buy } = invalidLedger();
    const store = new TestStore(events);
    const deps = testDeps(store);
    const plan: RedoPlan = {
      kind: "reverse",
      target_id: buy.id,
      reason: "gone",
      draft: { type: "reversal", reverses_id: buy.id, reason: "gone" },
      id: SEALED,
    };
    await expect(
      recordRedo(deps, plan, completeDraft(deps, plan.draft, SEALED)),
    ).rejects.toBeInstanceOf(DependentEventsError);
    const lonely: RedoPlan = {
      ...plan,
      target_id: NONE,
      draft: { ...plan.draft, reverses_id: NONE },
    };
    await expect(
      recordRedo(deps, lonely, completeDraft(deps, lonely.draft, SEALED)),
    ).rejects.toBeInstanceOf(NotFoundError);
    // The sale itself, reversed: it repairs the ledger, and it passes.
    const sale = events.at(-1) as LedgerEvent;
    expect(sale.type).toBe("sell");
    const repair: RedoPlan = {
      ...plan,
      target_id: sale.id,
      draft: { ...plan.draft, reverses_id: sale.id },
    };
    await recordRedo(deps, repair, completeDraft(deps, repair.draft, SEALED));
    expect((await store.load()).events.at(-1)?.id).toBe(SEALED);
  });

  it("asks for the confirmation of a repeated fingerprint", async () => {
    const builder = new LedgerBuilder();
    catalogue(builder);
    const deposit = builder.deposit({ account_id: "acc_fund" });
    const store = new TestStore(builder.build());
    const deps = testDeps(store);
    const plan: RedoPlan = { kind: "record", draft: draftOf(deposit), id: SEALED };
    const event = completeDraft(deps, plan.draft, SEALED);
    await expect(recordRedo(deps, plan, event)).rejects.toBeInstanceOf(DuplicateFingerprintError);
    await recordRedo(deps, plan, event, { confirmDuplicate: true });
    expect((await store.load()).events.at(-1)?.id).toBe(SEALED);
  });

  it("refuses an ISIN another asset has, as recording does (ADR-0009)", async () => {
    const builder = new LedgerBuilder();
    catalogue(builder);
    builder.asset("ast_isin", { isin: "IE00B4L5Y983" });
    const store = new TestStore(builder.build());
    const deps = testDeps(store);
    const other = new LedgerBuilder(700).asset("ast_twin", { isin: "IE00B4L5Y983" });
    const plan: RedoPlan = { kind: "record", draft: draftOf(other), id: SEALED };
    await expect(
      recordRedo(deps, plan, completeDraft(deps, plan.draft, SEALED)),
    ).rejects.toMatchObject({ code: "duplicate_isin" });
  });

  it("never records a correction: that one goes by correctEvent with its sealed ids", async () => {
    const { events, buy } = invalidLedger();
    const store = new TestStore(events);
    const deps = testDeps(store);
    const plan: RedoPlan = {
      kind: "correct",
      target_id: buy.id,
      reason: "typo",
      draft: draftOf(buy),
      reversal_id: OTHER,
      id: SEALED,
    };
    await expect(
      recordRedo(deps, plan, completeDraft(deps, depositPlan().draft, SEALED)),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await store.load()).events).toHaveLength(events.length);
  });
});
