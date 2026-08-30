import { describe, expect, it } from "vitest";
import {
  ConflictError,
  DependentEventsError,
  DuplicateFingerprintError,
  NotFoundError,
  ProjectionError,
} from "../../src/errors.js";
import { fiscalLots } from "../../src/projections/lots.js";
import { positionOf } from "../../src/projections/positions.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { BuyEvent, Draft, LedgerEvent, SupportedEvent } from "../../src/schema/events.js";
import { loadAndProject } from "../../src/usecases/project-ledger.js";
import { correctEvent, isPriorYear, reverseEvent } from "../../src/usecases/rectify.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { testDeps } from "./helpers.js";

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

const expectRejection = async <T>(
  promise: Promise<unknown>,
  type: new (...args: never[]) => T,
): Promise<T> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(type);
    return error as T;
  }
  throw new Error("expected rejection");
};

describe("reverseEvent", () => {
  it("appends a reversal and the projection ignores the pair", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const sell = b.sell({ account_id: "acc_fund", asset_id: "ast_world" });
    const store = new TestStore(b.build());
    const deps = testDeps(store, "2028-03-01T10:00:00.000Z");
    const result = await reverseEvent(deps, sell.id, "wrong quantity");
    expect(result.reversal.reverses_id).toBe(sell.id);
    expect(result.reversal.reason).toBe("wrong quantity");
    expect(result.priorYear).toBe(true);
    const { state } = await loadAndProject(deps);
    expect(state.reversed.get(sell.id)).toBe(result.reversal.id);
    expect(positionOf(state, "acc_fund", "ast_world").toString()).toBe("10");
  });

  it("rejects reversing a buy whose lot was consumed, listing the dependants", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const buy = b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const sell = b.sell({ account_id: "acc_fund", asset_id: "ast_world" });
    const store = new TestStore(b.build());
    const error = await expectRejection(
      reverseEvent(testDeps(store), buy.id, "x"),
      DependentEventsError,
    );
    expect(error.affected).toEqual([
      { id: sell.id, type: "sell", error: expect.stringContaining("holds") },
    ]);
    expect(store.all()).toHaveLength(9);
  });

  it("rejects reversing a transfer whose destination lots were sold", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const transfer = b.transfer({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      quantity_out: "4",
      nav_out: "105",
      value_date_out: "2027-03-03",
      to_account_id: "acc_fund",
      to_asset_id: "ast_bonds",
      quantity_in: "3.5",
      nav_in: "120",
      value_date_in: "2027-03-05",
    });
    const sell = b.sell({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      value_date: "2027-04-01",
      quantity: "1",
    });
    const store = new TestStore(b.build());
    const error = await expectRejection(
      reverseEvent(testDeps(store), transfer.id, "x"),
      DependentEventsError,
    );
    expect(error.affected.map((a) => a.id)).toEqual([sell.id]);
  });

  it("rejects reversing a referenced asset, a reversal, and unknown targets", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const asset = b.asset("ast_extra");
    const buy = b.buy({ account_id: "acc_fund", asset_id: "ast_extra" });
    const store = new TestStore(b.build());
    const deps = testDeps(store);
    const error = await expectRejection(reverseEvent(deps, asset.id, "x"), DependentEventsError);
    expect(error.affected.map((a) => [a.id, a.type])).toEqual([[buy.id, "buy"]]);

    const reversed = await reverseEvent(deps, buy.id, "undo");
    const again = await expectRejection(
      reverseEvent(deps, reversed.reversal.id, "x"),
      ProjectionError,
    );
    expect(again.code).toBe("reversal_of_reversal");
    const twice = await expectRejection(reverseEvent(deps, buy.id, "x"), ProjectionError);
    expect(twice.code).toBe("already_reversed");
    await expectRejection(reverseEvent(deps, "01ARYZ6S41TSV4RRFFQ69G5FZZ", "x"), NotFoundError);
  });

  it("ignores events that were already invalid before the rectification", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const deposit = b.deposit({ account_id: "acc_fund" });
    b.raw({ ...b.nextEnvelope("thesis_opened"), thesis_id: "t" } as LedgerEvent);
    const store = new TestStore(b.build());
    const result = await reverseEvent(testDeps(store, "2026-12-01T10:00:00.000Z"), deposit.id, "x");
    expect(result.reversal.reverses_id).toBe(deposit.id);
    expect(result.priorYear).toBe(false);
  });
});

describe("correctEvent", () => {
  it("writes reversal and replacement together and the projection matches a clean ledger", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const wrong = b.buy({ account_id: "acc_fund", asset_id: "ast_world", unit_price: "132.45" });
    const store = new TestStore(b.build());
    const deps = testDeps(store);
    const result = await correctEvent<BuyEvent>(
      deps,
      wrong.id,
      { ...draftOf(wrong), unit_price: "123.45" },
      "typo",
    );
    expect(result.event.corrects_id).toBe(wrong.id);
    expect(result.event.id > result.reversal.id).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(
      store
        .all()
        .slice(-2)
        .map((e) => e.type),
    ).toEqual(["reversal", "buy"]);

    const clean = new LedgerBuilder();
    catalogue(clean);
    clean.buy({ account_id: "acc_fund", asset_id: "ast_world", unit_price: "123.45" });
    const expected = fiscalLots(projectLedger(clean.build()), "ast_world")[0];
    const actual = fiscalLots(projectLedger(store.all()), "ast_world")[0];
    expect(actual?.cost_eur.eq(expected?.cost_eur as never)).toBe(true);
    expect(actual?.acquisition_date).toBe(expected?.acquisition_date);
    expect(actual?.source_event_id).toBe(result.event.id);
  });

  it("rejects an invalid replacement and dependants, and checks duplicates", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const buy = b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    b.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "8" });
    const store = new TestStore(b.build());
    const deps = testDeps(store);
    const own = await expectRejection(
      correctEvent<BuyEvent>(deps, buy.id, { ...draftOf(buy), asset_id: "ast_none" }, "x"),
      ProjectionError,
    );
    expect(own.code).toBe("unknown_asset");
    const dependants = await expectRejection(
      correctEvent<BuyEvent>(deps, buy.id, { ...draftOf(buy), quantity: "5" }, "x"),
      DependentEventsError,
    );
    expect(dependants.affected).toHaveLength(1);
    expect(store.all()).toHaveLength(9);

    const other = b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "12" });
    const seeded = new TestStore(b.build());
    const seededDeps = testDeps(seeded);
    const duplicate = await expectRejection(
      correctEvent<BuyEvent>(seededDeps, buy.id, { ...draftOf(other) }, "x"),
      DuplicateFingerprintError,
    );
    expect(duplicate.existing).toEqual([other.id]);
    const confirmed = await correctEvent<BuyEvent>(seededDeps, buy.id, { ...draftOf(other) }, "x", {
      confirmDuplicate: true,
    });
    expect(confirmed.event.quantity).toBe("12");
  });

  it("decides the current year in Europe/Madrid, not UTC", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const buy = b.buy({ account_id: "acc_fund", asset_id: "ast_world", value_date: "2027-06-01" });
    const store = new TestStore(b.build());
    const madridNewYear = testDeps(store, "2027-12-31T23:30:00.000Z");
    const result = await reverseEvent(madridNewYear, buy.id, "x");
    expect(result.priorYear).toBe(true);
    const utcNewYear = testDeps(new TestStore(b.build()), "2028-01-01T00:30:00.000Z");
    expect((await reverseEvent(utcNewYear, buy.id, "x")).priorYear).toBe(true);
    const stillDecember = testDeps(new TestStore(b.build()), "2027-12-31T22:30:00.000Z");
    expect((await reverseEvent(stillDecember, buy.id, "x")).priorYear).toBe(false);
  });

  it("propagates conflicts and flags prior tax years", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const buy = b.buy({ account_id: "acc_fund", asset_id: "ast_world", value_date: "2026-05-01" });
    const store = new TestStore(b.build());
    const deps = testDeps(store, "2027-01-15T10:00:00.000Z");
    const racing = {
      ...deps,
      store: { load: () => store.load(), append: () => Promise.reject(new ConflictError()) },
    };
    await expectRejection(correctEvent<BuyEvent>(racing, buy.id, draftOf(buy), "x"), ConflictError);
    const result = await correctEvent<BuyEvent>(deps, buy.id, { ...draftOf(buy), fee: "1" }, "fee");
    expect(result.priorYear).toBe(true);
    const state = projectLedger(store.all());
    expect(isPriorYear(deps, state, b.build()[0] as LedgerEvent)).toBe(false);
  });
});
