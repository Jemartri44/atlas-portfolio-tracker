import { describe, expect, it } from "vitest";
import {
  ConflictError,
  DuplicateFingerprintError,
  ProjectionError,
  ValidationError,
} from "../../src/errors.js";
import { physicalPositions } from "../../src/projections/positions.js";
import type { BuyEvent } from "../../src/schema/events.js";
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
  trade_date: "2027-01-10",
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
});
