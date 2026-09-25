import { describe, expect, it } from "vitest";
import {
  ConflictError,
  DependentEventsError,
  DuplicateFingerprintError,
  InvalidLedgerError,
  ProjectionError,
  SchemaTooNewError,
  ValidationError,
} from "../../src/errors.js";
import { physicalPositions } from "../../src/projections/positions.js";
import type { InvalidEvent } from "../../src/projections/state.js";
import type { BuyEvent } from "../../src/schema/events.js";
import { encodeLine } from "../../src/schema/line.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { loadAndProject } from "../../src/usecases/project-ledger.js";
import { duplicatesOf, recordEvent } from "../../src/usecases/record-event.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { testDeps } from "./helpers.js";

const seeded = (): TestStore => {
  const b = new LedgerBuilder();
  catalogue(b);
  return new TestStore(b.build());
};

const buyDraft = {
  type: "buy" as const,
  account_id: "acc_fund",
  asset_id: "ast_world",
  trade_date: "2027-01-11",
  value_date: "2027-01-12",
  quantity: "10",
  unit_price: "100",
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-01-12",
  fee: "0",
  source: "manual",
};

describe("recordEvent", () => {
  it("completes the envelope and the fingerprint, validates, projects and appends", async () => {
    const store = seeded();
    const deps = testDeps(store);
    const result = await recordEvent<BuyEvent>(deps, buyDraft);
    expect(result.event.schema_version).toBe(1);
    expect(result.event.id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    expect(result.event.recorded_at).toBe("2027-08-30T10:00:00.000Z");
    expect(result.event.fingerprint).toMatch(/^sha256:/);
    expect(result.warnings).toEqual([]);
    expect(result.etag).toBe("1");
    const { state } = await loadAndProject(deps);
    expect(physicalPositions(state)[0]?.quantity.toString()).toBe("10");
  });

  it("keeps an explicit fingerprint and reports warnings of the new event only", async () => {
    const store = seeded();
    const deps = testDeps(store);
    const result = await recordEvent<BuyEvent>(deps, {
      ...buyDraft,
      account_id: "acc_etf",
      asset_id: "ast_gold",
      fingerprint: "sha256:explicit",
      fx_rate_date: "2027-01-20",
    });
    expect(result.event.fingerprint).toBe("sha256:explicit");
    expect(result.warnings.map((w) => w.code)).toEqual([
      "currency_mismatch",
      "fx_rate_date_after_fiscal_date",
    ]);
  });

  it("rejects invalid shapes and broken invariants without writing", async () => {
    const store = seeded();
    const deps = testDeps(store);
    await expect(recordEvent(deps, { ...buyDraft, quantity: "0" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(recordEvent(deps, { ...buyDraft, type: "sell" })).rejects.toBeInstanceOf(
      ProjectionError,
    );
    expect(store.all()).toHaveLength(7);
  });

  it("reports the later event broken by a backdated one", async () => {
    const store = seeded();
    const deps = testDeps(store);
    await recordEvent<BuyEvent>(deps, buyDraft);
    const sell = await recordEvent(deps, {
      ...buyDraft,
      type: "sell",
      value_date: "2027-03-01",
      quantity: "10",
    });
    try {
      await recordEvent(deps, {
        ...buyDraft,
        type: "sell",
        value_date: "2027-02-01",
        quantity: "5",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectionError);
      expect((error as ProjectionError).eventId).toBe(sell.event.id);
      expect((error as ProjectionError).code).toBe("insufficient_position");
      return;
    }
    throw new Error("expected rejection");
  });

  it("warns about duplicated fingerprints unless confirmed", async () => {
    const store = seeded();
    const deps = testDeps(store);
    const first = await recordEvent<BuyEvent>(deps, buyDraft);
    let caught: DuplicateFingerprintError | undefined;
    try {
      await recordEvent(deps, buyDraft);
    } catch (error) {
      caught = error as DuplicateFingerprintError;
    }
    expect(caught).toBeInstanceOf(DuplicateFingerprintError);
    expect(caught?.existing).toEqual([first.event.id]);
    expect(store.all()).toHaveLength(8);
    const second = await recordEvent(deps, buyDraft, { confirmDuplicate: true });
    expect(second.event.id).not.toBe(first.event.id);
    expect(store.all()).toHaveLength(9);
  });

  it("propagates store conflicts", async () => {
    const store = seeded();
    const deps = testDeps(store);
    const racing = {
      ...deps,
      store: {
        schema: store.schema,
        load: () => store.load(),
        append: () => Promise.reject(new ConflictError()),
        replace: () => Promise.reject(new ConflictError()),
        appendLines: () => Promise.reject(new ConflictError()),
        replaceLines: () => Promise.reject(new ConflictError()),
      },
    };
    await expect(recordEvent(racing, buyDraft)).rejects.toBeInstanceOf(ConflictError);
  });

  it("finds no duplicates for events without fingerprint or not yet indexed", () => {
    const b = new LedgerBuilder();
    const buy = b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    expect(duplicatesOf(new Map(), buy)).toEqual([]);
    expect(duplicatesOf(new Map(), b.account("acc_x"))).toEqual([]);
  });

  it("records events without fingerprint (catalogue, tracking)", async () => {
    const store = new TestStore();
    const deps = testDeps(store);
    const account = await recordEvent(deps, {
      type: "account_created",
      account_id: "acc_x",
      name: "X",
      platform: "test",
      book: "core",
      base_currency: "EUR",
      country: "ES",
      active: true,
    });
    expect("fingerprint" in account.event).toBe(false);
    expect(store.all()).toHaveLength(1);
  });

  it("never writes on a ledger from a newer schema: the load already rejects it (data-schema.md §5)", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const newer = b.build().map((event) => ({ ...event, schema_version: 2 }));
    const store = TestStore.fromLines(newer.map(encodeLine));
    await expect(recordEvent(testDeps(store), buyDraft)).rejects.toBeInstanceOf(SchemaTooNewError);
    expect(
      store
        .text()
        .split("\n")
        .filter((line) => line !== ""),
    ).toHaveLength(newer.length);
  });
});

/**
 * A ledger where the fiscal-date rule decides whether a sale has lots: the buy
 * settles after the sale was agreed, so reading funds by trade date puts the
 * sale first and leaves it without lots (ADR-0013, ADR-0015).
 */
const reorderable = (): TestStore => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.settings(DEFAULT_SETTINGS);
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    trade_date: "2027-01-13",
    value_date: "2027-01-15",
    quantity: "10",
  });
  b.sell({
    account_id: "acc_fund",
    asset_id: "ast_world",
    trade_date: "2027-01-12",
    value_date: "2027-01-20",
    quantity: "10",
  });
  return new TestStore(b.build());
};

const byTradeDate = mergeSettings(DEFAULT_SETTINGS, {
  fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, fund: "trade_date" },
});

describe("recordEvent: a settings change that reinterprets the past (ADR-0015)", () => {
  it("refuses without acceptInvalid, listing the events that become invalid", async () => {
    const store = reorderable();
    const before = (await store.load()).lines.length;
    try {
      await recordEvent(testDeps(store), { type: "settings_changed", settings: byTradeDate });
      throw new Error("expected a DependentEventsError");
    } catch (error) {
      expect(error).toBeInstanceOf(DependentEventsError);
      const dependents = error as DependentEventsError;
      expect(dependents.code).toBe("newly_invalid_events");
      expect(dependents.affected).toHaveLength(1);
      expect(dependents.affected[0]?.type).toBe("sell");
      expect(dependents.affected[0]?.error).toContain("holds 0 of ast_world");
    }
    expect((await store.load()).lines).toHaveLength(before);
  });

  it("writes with acceptInvalid and reports what became invalid", async () => {
    const store = reorderable();
    const result = await recordEvent(
      testDeps(store),
      { type: "settings_changed", settings: byTradeDate },
      { acceptInvalid: true },
    );
    expect(result.newlyInvalid).toHaveLength(1);
    expect(result.newlyInvalid[0]?.type).toBe("sell");
    const { state } = await loadAndProject({ store }, { collectErrors: true });
    expect(state.invalid).toHaveLength(1);
  });

  it("accepts a harmless settings change over an already degraded ledger", async () => {
    const store = reorderable();
    const deps = testDeps(store);
    await recordEvent(
      deps,
      { type: "settings_changed", settings: byTradeDate },
      { acceptInvalid: true },
    );
    // The ledger is already degraded; this change adds no new invalid event.
    const result = await recordEvent(deps, {
      type: "settings_changed",
      settings: mergeSettings(byTradeDate, { stale_price_days: 9 }),
    });
    expect(result.newlyInvalid).toEqual([]);
  });

  it("still refuses any other mutation over a degraded ledger, naming the culprit", async () => {
    const store = reorderable();
    const deps = testDeps(store);
    await recordEvent(
      deps,
      { type: "settings_changed", settings: byTradeDate },
      { acceptInvalid: true },
    );
    const offender = (await loadAndProject({ store }, { collectErrors: true })).state
      .invalid[0] as InvalidEvent;
    try {
      await recordEvent(deps, {
        type: "cash_deposit",
        account_id: "acc_fund",
        value_date: "2027-03-01",
        fx_rate_date: "2027-03-01",
        amount: "100",
        currency: "EUR",
        fx_rate: "1",
      });
      throw new Error("expected rejection");
    } catch (error) {
      // The new deposit is blameless: the error names the event that is not.
      expect(error).toBeInstanceOf(InvalidLedgerError);
      expect((error as InvalidLedgerError).code).toBe("ledger_has_invalid_events");
      expect((error as InvalidLedgerError).details).toMatchObject({
        offending_id: offender.event.id,
        offending_type: "sell",
        invalid_count: 1,
      });
    }
  });

  it("lets a new event that repairs the reading through", async () => {
    const store = reorderable();
    const deps = testDeps(store);
    await recordEvent(
      deps,
      { type: "settings_changed", settings: byTradeDate },
      { acceptInvalid: true },
    );
    // A buy agreed before the sale gives it lots again under the new rule.
    const result = await recordEvent(deps, {
      ...buyDraft,
      trade_date: "2027-01-11",
      value_date: "2027-03-01",
    });
    expect(result.newlyInvalid).toEqual([]);
    const { state } = await loadAndProject({ store }, { collectErrors: true });
    expect(state.invalid).toEqual([]);
  });

  it("admits acceptInvalid only for a settings change", async () => {
    const store = seeded();
    await expect(
      recordEvent(testDeps(store), buyDraft, { acceptInvalid: true }),
    ).rejects.toMatchObject({ code: "accept_invalid_not_allowed" });
  });
});
