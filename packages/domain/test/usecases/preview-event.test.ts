import { describe, expect, it } from "vitest";
import { DuplicateFingerprintError, InvalidLedgerError } from "../../src/errors.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { previewEvent } from "../../src/usecases/preview-event.js";
import { recordEvent } from "../../src/usecases/record-event.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { testDeps } from "./helpers.js";

/** Catalogue plus one purchase of ten units at ten euros, settled on 2027-01-12. */
const seeded = () => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "10",
    unit_price: "10",
    trade_date: "2027-01-08",
    value_date: "2027-01-12",
  });
  return b.build();
};

const buyDraft = {
  type: "buy" as const,
  account_id: "acc_fund",
  asset_id: "ast_world",
  trade_date: "2027-02-08",
  value_date: "2027-02-10",
  quantity: "5",
  unit_price: "12",
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-02-10",
  fee: "1",
  source: "manual",
};

describe("previewEvent", () => {
  it("shows the candidate as it would be written, with its envelope and fingerprint", async () => {
    const store = new TestStore(seeded());
    const preview = await previewEvent(testDeps(store), buyDraft);
    expect(preview.candidate.type).toBe("buy");
    expect(preview.candidate.id).toHaveLength(26);
    expect(preview.candidate.recorded_at).toBe("2027-08-30T10:00:00.000Z");
    expect((preview.candidate as { fingerprint: string }).fingerprint).toMatch(/^sha256:/);
    expect(preview.etag).toBe("0");
  });

  it("shows the effect on positions and lots, before and after", async () => {
    const store = new TestStore(seeded());
    const preview = await previewEvent(testDeps(store), buyDraft);
    expect(preview.before.positions.map((row) => row.quantity.toString())).toEqual(["10"]);
    expect(preview.after.positions.map((row) => row.quantity.toString())).toEqual(["15"]);
    expect(preview.before.lots).toHaveLength(1);
    expect(preview.after.lots).toHaveLength(2);
    // Cost of the new lot: 5 × 12 + 1 of fee.
    expect(preview.after.lots[1]?.cost_eur.amount.toString()).toBe("61");
  });

  it("writes nothing", async () => {
    const store = new TestStore(seeded());
    const before = store.text();
    await previewEvent(testDeps(store), buyDraft);
    expect(store.text()).toBe(before);
    expect((await store.load()).etag).toBe("0");
  });

  it("shows the gains a sale would book", async () => {
    const store = new TestStore(seeded());
    const preview = await previewEvent(testDeps(store), {
      ...buyDraft,
      type: "sell" as const,
      quantity: "4",
      unit_price: "15",
      fee: "0",
    });
    expect(preview.gains).toHaveLength(1);
    expect(preview.gains[0]?.gain_eur_rounded.amount.toString()).toBe("20");
    expect(preview.after.positions.map((row) => row.quantity.toString())).toEqual(["6"]);
  });

  it("shows the warnings the candidate itself raises, and nobody else's", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      trade_date: "2027-01-08",
      value_date: "2027-01-12",
    });
    // A loss-making sale opens the wash-sale window (ADR-0014).
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "5",
      unit_price: "6",
      trade_date: "2027-03-08",
      value_date: "2027-03-10",
    });
    const store = new TestStore(b.build());
    const preview = await previewEvent(testDeps(store), {
      ...buyDraft,
      trade_date: "2027-04-08",
      value_date: "2027-04-10",
      fx_rate_date: "2027-04-09",
    });
    expect(preview.warnings.map((warning) => warning.code)).toContain(
      "wash_sale_window_repurchase",
    );
    expect(preview.warnings.every((warning) => warning.event_id === preview.candidate.id)).toBe(
      true,
    );
  });

  it("reports a repeated fingerprint instead of throwing: the repetition is the user's call", async () => {
    const events = seeded();
    const store = new TestStore(events);
    const deps = testDeps(store);
    const first = await previewEvent(deps, buyDraft);
    await recordEvent(deps, buyDraft);
    const second = await previewEvent(deps, buyDraft);
    expect(first.duplicates).toEqual([]);
    expect(second.duplicates).toHaveLength(1);
    // And the write does refuse it without an explicit confirmation (ADR-0012).
    await expect(recordEvent(deps, buyDraft)).rejects.toBeInstanceOf(DuplicateFingerprintError);
  });

  it("throws exactly what the write would throw, with its code and details", async () => {
    const store = new TestStore(seeded());
    const deps = testDeps(store);
    const tooMuch = { ...buyDraft, type: "sell" as const, quantity: "99" };
    await expect(previewEvent(deps, tooMuch)).rejects.toMatchObject({
      code: "insufficient_position",
      details: { account_id: "acc_fund", asset_id: "ast_world" },
    });
    await expect(recordEvent(deps, tooMuch)).rejects.toMatchObject({
      code: "insufficient_position",
    });
  });

  it("blames the offending event, not the candidate, on a degraded ledger", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    // A sale of an asset that is not in the catalogue: nothing the candidate
    // does can make it valid, which is what a degraded ledger means (ADR-0015).
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_missing",
      quantity: "5",
      value_date: "2027-06-10",
    });
    const store = new TestStore(b.build());
    await expect(previewEvent(testDeps(store), buyDraft)).rejects.toBeInstanceOf(
      InvalidLedgerError,
    );
  });

  it("lists the events a settings change would leave invalid", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    // By value date the purchase settles first; by trade date the sale comes
    // first and has nothing to sell. Same facts, another reading (ADR-0013).
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      trade_date: "2027-12-30",
      value_date: "2028-01-03",
    });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "12",
      trade_date: "2027-12-29",
      value_date: "2028-01-04",
    });
    const store = new TestStore(b.build());
    const preview = await previewEvent(
      testDeps(store),
      {
        type: "settings_changed" as const,
        settings: mergeSettings(DEFAULT_SETTINGS, { fiscal_date_rule: { fund: "trade_date" } }),
      },
      { acceptInvalid: true },
    );
    // By trade date the sale comes before the purchase and stops being valid.
    expect(preview.newlyInvalid).toHaveLength(1);
    expect(preview.newlyInvalid[0]?.type).toBe("sell");
  });

  it("limits the effect to the assets asked for", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      value_date: "2027-01-12",
    });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      quantity: "20",
      unit_price: "5",
      value_date: "2027-01-12",
    });
    const store = new TestStore(b.build());
    const narrow = await previewEvent(testDeps(store), buyDraft, { assets: ["ast_bonds"] });
    expect(narrow.before.positions.map((row) => row.asset_id)).toEqual(["ast_bonds"]);
    const wide = await previewEvent(testDeps(store), buyDraft, {
      assets: ["ast_world", "ast_bonds"],
    });
    expect(wide.before.positions).toHaveLength(2);
  });

  it("takes the two assets of a transfer when the caller names none", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      value_date: "2027-01-12",
    });
    const store = new TestStore(b.build());
    const preview = await previewEvent(testDeps(store), {
      type: "transfer" as const,
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      quantity_out: "10",
      nav_out: "12",
      value_date_out: "2027-05-02",
      to_account_id: "acc_fund",
      to_asset_id: "ast_bonds",
      quantity_in: "5",
      nav_in: "24",
      value_date_in: "2027-05-04",
    });
    // The origin is emptied and the destination appears: the two assets were
    // taken from the event without the caller naming them.
    expect(preview.before.positions.map((row) => row.asset_id)).toEqual(["ast_world"]);
    expect(preview.after.positions.map((row) => row.asset_id)).toEqual(["ast_bonds"]);
    // The transfer keeps the acquisition date of the origin lot (constitution II).
    expect(preview.after.lots.find((lot) => lot.asset_id === "ast_bonds")?.acquisition_date).toBe(
      "2027-01-12",
    );
  });

  it("shows no effect for an event with no asset at all", async () => {
    const store = new TestStore(seeded());
    const preview = await previewEvent(testDeps(store), {
      type: "cash_deposit" as const,
      account_id: "acc_fund",
      value_date: "2027-03-01",
      fx_rate_date: "2027-03-01",
      amount: "1000",
      currency: "EUR",
      fx_rate: "1",
    });
    expect(preview.before.positions).toEqual([]);
    expect(preview.after.positions).toEqual([]);
    expect(preview.after.lots).toEqual([]);
  });

  it("hands back the loaded ledger so confirming does not load it again", async () => {
    const events = seeded();
    const store = new TestStore(events);
    const preview = await previewEvent(testDeps(store), buyDraft);
    expect(preview.events).toHaveLength(events.length);
    expect(preview.state.accounts.get("acc_fund")?.name).toBe("acc_fund");
  });
});
