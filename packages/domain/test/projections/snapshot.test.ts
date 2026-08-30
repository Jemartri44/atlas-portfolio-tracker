import { describe, expect, it } from "vitest";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { snapshotDiff, snapshotOf, sortKeysDeep } from "../../src/projections/snapshot.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

/** A ledger touching every projection: lots, gains, income, cash, orders, requests, theses, valuations. */
const richLedger = (): LedgerEvent[] => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.deposit({ account_id: "acc_fund" });
  const order = b.orderPlaced({ account_id: "acc_fund", asset_id: "ast_world" });
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    value_date: "2027-07-03",
    order_id: order.id,
    amount: "500",
    unit_price: undefined as never,
    quantity: "4.5",
  });
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", value_date: "2027-01-10" });
  b.sell({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "3",
    value_date: "2027-08-01",
  });
  const request = b.transferRequested({
    from_account_id: "acc_fund",
    from_asset_id: "ast_world",
    to_account_id: "acc_fund",
    to_asset_id: "ast_bonds",
    quantity_out: "2",
    requested_date: "2027-09-01",
  });
  b.transfer({
    request_id: request.id,
    from_account_id: "acc_fund",
    from_asset_id: "ast_world",
    quantity_out: "2",
    nav_out: "100",
    value_date_out: "2027-09-03",
    to_account_id: "acc_fund",
    to_asset_id: "ast_bonds",
    quantity_in: "1.5",
    nav_in: "133",
    value_date_in: "2027-09-05",
  });
  b.interest({ account_id: "acc_fund" });
  b.dividend({ account_id: "acc_etf", asset_id: "ast_gold", currency: "USD", fx_rate: "1.1" });
  b.valuation({ account_id: "acc_etf", asset_id: "ast_gold", currency: "USD", fx_rate: "1.1" });
  b.thesisOpened({ thesis_id: "th_1", planned_size_eur: "2000" });
  b.buy({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    currency: "USD",
    fx_rate: "1.1",
    thesis_id: "th_1",
    value_date: "2027-07-01",
  });
  b.sell({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    currency: "USD",
    fx_rate: "1.1",
    quantity: "10",
    value_date: "2027-09-01",
    thesis_id: "th_1",
  });
  b.thesisClosed("th_1");
  return b.build();
};

describe("snapshotOf", () => {
  it("is stable across two projections and serialises decimals as strings", () => {
    const events = richLedger();
    const first = snapshotOf(projectLedger(events));
    const second = snapshotOf(projectLedger(events));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(snapshotDiff(first, second)).toEqual([]);
    const json = JSON.stringify(first);
    expect(json).not.toContain('"amount":{');
    expect(json).not.toContain('"position"');
    expect(json).not.toContain("days_open");
    expect(Object.keys(first)).toEqual([...Object.keys(first)].sort());
  });

  it("covers every projection with sorted keys, without file positions or messages", () => {
    const state = projectLedger(richLedger(), { collectErrors: true });
    const snapshot = snapshotOf(state) as {
      accounts: unknown[];
      assets: unknown[];
      positions: unknown[];
      cash: unknown[];
      lots: Record<string, { open: unknown[]; closed: unknown[] }>;
      gains: unknown[];
      income: unknown[];
      valuations: unknown[];
      orders: unknown[];
      transfer_requests: unknown[];
      theses: Record<string, unknown>[];
      settings_history: unknown[];
      fiscal_settings: unknown;
      warnings: unknown[];
      invalid: unknown[];
    };
    expect(snapshot.accounts.map((a) => (a as { account_id: string }).account_id)).toEqual([
      "acc_bucket",
      "acc_etf",
      "acc_fund",
    ]);
    expect(snapshot.assets).toHaveLength(4);
    expect(snapshot.positions).toHaveLength(2);
    expect(snapshot.cash.length).toBeGreaterThan(0);
    expect(Object.keys(snapshot.lots)).toEqual(["ast_bonds", "ast_spec", "ast_world"]);
    const transferred = snapshot.lots.ast_bonds?.open[0] as Record<string, unknown>;
    expect(transferred.source_lot_id).toBeDefined();
    expect(transferred.position).toBeUndefined();
    expect(Object.keys(transferred)).toEqual([...Object.keys(transferred)].sort());
    expect(snapshot.gains).toHaveLength(2);
    expect((snapshot.gains[0] as { by_lot: unknown[] }).by_lot.length).toBeGreaterThan(0);
    expect(snapshot.income.map((i) => (i as { kind: string }).kind)).toEqual([
      "dividend",
      "interest",
    ]);
    expect(snapshot.valuations).toHaveLength(1);
    expect((snapshot.orders[0] as { stage: string }).stage).toBe("filled");
    expect((snapshot.transfer_requests[0] as { stage: string }).stage).toBe("completed");
    const thesis = snapshot.theses[0] as Record<string, unknown>;
    expect(thesis.status).toBe("closed");
    expect(thesis.result_eur_rounded).toBe("0");
    expect(thesis.opened_position).toBeUndefined();
    expect(thesis.closed_position).toBeUndefined();
    expect(snapshot.settings_history).toEqual([]);
    expect(snapshot.fiscal_settings).toEqual(sortKeysDeep(state.fiscalSettings));
    expect(snapshot.warnings).toEqual([]);
    expect(snapshot.invalid).toEqual([]);
  });

  it("records warnings without their message and invalid events by code", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", currency: "USD", fx_rate: "1.1" });
    const bad = b.buy({ account_id: "acc_none", asset_id: "ast_world" });
    const snapshot = snapshotOf(projectLedger(b.build(), { collectErrors: true })) as {
      warnings: Record<string, unknown>[];
      invalid: Record<string, unknown>[];
    };
    expect(snapshot.warnings[0]).toEqual({
      code: "currency_mismatch",
      details: { asset_currency: "EUR", asset_id: "ast_world", currency: "USD" },
      event_id: b.build()[7]?.id,
    });
    expect(snapshot.warnings[0]?.message).toBeUndefined();
    expect(snapshot.invalid).toEqual([{ code: "unknown_account", event_id: bad.id, type: "buy" }]);
  });

  it("reports the top-level keys that differ", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const base = snapshotOf(projectLedger(b.build()));
    b.deposit({ account_id: "acc_fund" });
    const changed = snapshotOf(projectLedger(b.build()));
    expect(snapshotDiff(base, changed)).toEqual(["cash"]);
    expect(snapshotDiff(base, { ...base, extra: 1 })).toEqual(["extra"]);
  });

  it("sortKeysDeep sorts nested objects, keeps array order and drops undefined", () => {
    expect(JSON.stringify(sortKeysDeep({ b: [{ z: 1, a: undefined, y: 2 }], a: null }))).toBe(
      '{"a":null,"b":[{"y":2,"z":1}]}',
    );
  });
});
