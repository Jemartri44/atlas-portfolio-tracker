import { describe, expect, it } from "vitest";
import {
  DomainError,
  ProjectionError,
  UnsupportedEventError,
  ValidationError,
} from "../../src/errors.js";
import { Quantity } from "../../src/money/quantity.js";
import { cashBalances } from "../../src/projections/cash.js";
import { applyAccountCreated, applyAssetCreated } from "../../src/projections/catalogue.js";
import { realizedGains } from "../../src/projections/gains.js";
import { investmentIncome } from "../../src/projections/income.js";
import { integrity } from "../../src/projections/integrity.js";
import { fiscalLots, openQuantity } from "../../src/projections/lots.js";
import { applySell } from "../../src/projections/operations.js";
import { pendingOrders, pendingTransfers } from "../../src/projections/pending.js";
import { adjustPosition, physicalPositions, positionOf } from "../../src/projections/positions.js";
import { projectLedger, toProjectionError } from "../../src/projections/project-ledger.js";
import { createEmptyState } from "../../src/projections/state.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const failure = (events: readonly LedgerEvent[]): ProjectionError => {
  try {
    projectLedger(events);
  } catch (error) {
    if (error instanceof ProjectionError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a ProjectionError");
};

const goldTrades = (builder: LedgerBuilder) => {
  const buy = builder.buy({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    trade_date: "2026-12-30",
    value_date: "2027-01-02",
    quantity: "5",
    unit_price: "200",
    fee: "1.5",
    currency: "USD",
    fx_rate: "1.0850",
    fx_rate_date: "2026-12-30",
  });
  const sell = builder.sell({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    trade_date: "2026-12-31",
    value_date: "2027-01-04",
    quantity: "2",
    unit_price: "210",
    fee: "1",
    currency: "USD",
    fx_rate: "1.0900",
    fx_rate_date: "2026-12-31",
  });
  return { buy, sell };
};

describe("projectLedger: quickstart scenario", () => {
  it("projects positions, cash, lots and gains from a mixed ledger", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_fund" });
    const world = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2026-09-01",
      value_date: "2026-09-02",
      quantity: "10.123456",
      unit_price: "98.78",
      amount: "1000",
    });
    const { buy, sell } = goldTrades(b);
    const state = projectLedger(b.build());

    expect(
      physicalPositions(state).map((p) => `${p.account_id}|${p.asset_id}=${p.quantity}`),
    ).toEqual(["acc_fund|ast_world=10.123456", "acc_etf|ast_gold=3"]);
    expect(
      cashBalances(state).map((c) => `${c.account_id}|${c.currency}=${c.balance.amount}`),
    ).toEqual(["acc_fund|EUR=4000", "acc_etf|USD=-582.5"]);
    const worldLot = fiscalLots(state, "ast_world")[0];
    expect(worldLot?.id).toBe(`${world.id}#0`);
    expect(worldLot?.acquisition_date).toBe("2026-09-02");
    expect(worldLot?.cost_eur.amount.toString()).toBe("1000");
    const goldLot = fiscalLots(state, "ast_gold")[0];
    expect(goldLot?.acquisition_date).toBe("2026-12-30");
    expect(goldLot?.original_cost_eur.amount.toString()).toBe("923.0414746544");
    expect(goldLot?.quantity.toString()).toBe("3");
    expect(goldLot?.source_event_id).toBe(buy.id);

    expect(realizedGains(state, 2027)).toEqual([]);
    const [gain] = realizedGains(state, 2026);
    expect(gain?.event_id).toBe(sell.id);
    expect(gain?.proceeds_eur.amount.toString()).toBe("384.4036697248");
    expect(gain?.cost_eur.amount.toString()).toBe("369.2165898618");
    expect(gain?.gain_eur.amount.toString()).toBe("15.187079863");
    expect(gain?.gain_eur_rounded.amount.toString()).toBe("15.19");
    expect(gain?.by_lot).toHaveLength(1);
    expect(state.warnings).toEqual([]);
    expect(integrity(state)).toEqual([]);
  });

  it("moves the sale to the settlement year when the fiscal date rule changes", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    goldTrades(b);
    const flipped = mergeSettings(DEFAULT_SETTINGS, {
      fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, etc: "value_date" },
    });
    const overridden = projectLedger(b.build(), { settings: flipped });
    expect(realizedGains(overridden, 2026)).toEqual([]);
    expect(realizedGains(overridden, 2027)).toHaveLength(1);
    expect(fiscalLots(overridden, "ast_gold")[0]?.acquisition_date).toBe("2027-01-02");
    b.settings(flipped);
    const fromLedger = projectLedger(b.build());
    expect(realizedGains(fromLedger, 2027)).toHaveLength(1);
    expect(fromLedger.fiscalSettings).toBe(flipped);
  });
});

describe("projectLedger: chronological order (Q1)", () => {
  it("lets a late-recorded earlier buy be consumed first", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const first = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2027-01-10",
    });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2027-03-01",
      quantity: "5",
      unit_price: "120",
    });
    const late = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2026-12-01",
      quantity: "5",
      unit_price: "80",
    });
    const state = projectLedger(b.build());
    const [gain] = realizedGains(state, 2027);
    expect(gain?.by_lot[0]?.lot_id).toBe(`${late.id}#0`);
    expect(gain?.gain_eur.amount.toString()).toBe("200");
    expect(
      fiscalLots(state, "ast_world")
        .find((lot) => lot.source_event_id === first.id)
        ?.quantity.toString(),
    ).toBe("10");
    expect(state.warnings).toEqual([]);
  });

  it("validates a sell against the position on its own date", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", value_date: "2027-02-01" });
    const sell = b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2027-01-15",
    });
    const error = failure(b.build());
    expect(error.code).toBe("insufficient_position");
    expect(error.eventId).toBe(sell.id);
  });

  it("breaks date ties by file position, also for FIFO", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const second = b.buy({ account_id: "acc_fund", asset_id: "ast_world", unit_price: "90" });
    const first = b.buy({ account_id: "acc_fund", asset_id: "ast_world", unit_price: "110" });
    b.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
    const state = projectLedger(b.build());
    expect(realizedGains(state, 2027)[0]?.by_lot[0]?.lot_id).toBe(`${second.id}#0`);
    expect(
      fiscalLots(state, "ast_world").find((lot) => lot.source_event_id === first.id)?.closed,
    ).toBe(false);
  });
});

describe("projectLedger: rectification", () => {
  it("ignores reversed pairs and rejects reversing a consumed buy", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const sell = b.sell({ account_id: "acc_fund", asset_id: "ast_world" });
    b.reversal(sell.id, "wrong price");
    const state = projectLedger(b.build());
    expect(state.reversed.get(sell.id)).toBeDefined();
    expect(realizedGains(state, 2027)).toEqual([]);
    expect(positionOf(state, "acc_fund", "ast_world").toString()).toBe("10");

    const c = new LedgerBuilder();
    catalogue(c);
    const buy2 = c.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const sell2 = c.sell({ account_id: "acc_fund", asset_id: "ast_world" });
    c.reversal(buy2.id);
    const error = failure(c.build());
    expect(error.code).toBe("insufficient_position");
    expect(error.eventId).toBe(sell2.id);
    const collected = projectLedger(c.build(), { collectErrors: true });
    expect(collected.invalid.map((entry) => entry.event.id)).toEqual([sell2.id]);
    expect(positionOf(collected, "acc_fund", "ast_world").isZero()).toBe(true);
  });

  it("rejects reversal of a reversal, of an unknown event and double reversals", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const buy = b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const reversal = b.reversal(buy.id);
    b.reversal(reversal.id);
    expect(failure(b.build()).code).toBe("reversal_of_reversal");

    const c = new LedgerBuilder();
    catalogue(c);
    c.reversal("01ARYZ6S41TSV4RRFFQ69G5FZZ");
    expect(failure(c.build()).code).toBe("reversal_target_missing");

    const d = new LedgerBuilder();
    catalogue(d);
    const deposit = d.deposit({ account_id: "acc_fund" });
    d.reversal(deposit.id);
    d.reversal(deposit.id);
    expect(failure(d.build()).code).toBe("already_reversed");
  });

  it("accepts a correction that points to a reversed event and rejects a dangling one", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const wrong = b.buy({ account_id: "acc_fund", asset_id: "ast_world", unit_price: "132.45" });
    b.reversal(wrong.id);
    const right = b.buy({ account_id: "acc_fund", asset_id: "ast_world", unit_price: "123.45" });
    right.corrects_id = wrong.id;
    const state = projectLedger(b.build());
    expect(fiscalLots(state, "ast_world")[0]?.cost_eur.amount.toString()).toBe("1234.5");

    const c = new LedgerBuilder();
    catalogue(c);
    const original = c.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const correction = c.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    correction.corrects_id = original.id;
    expect(failure(c.build()).code).toBe("dangling_correction");
  });

  it("rejects duplicate ids even when collecting errors and reserved types always", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const deposit = b.deposit({ account_id: "acc_fund" });
    b.raw({ ...deposit });
    expect(() => projectLedger(b.build(), { collectErrors: true })).toThrow(ProjectionError);

    const c = new LedgerBuilder();
    catalogue(c);
    c.raw({ ...c.nextEnvelope("thesis_opened"), thesis_id: "t1" } as LedgerEvent);
    expect(() => projectLedger(c.build())).toThrow(UnsupportedEventError);
    const collected = projectLedger(c.build(), { collectErrors: true });
    expect(collected.invalid[0]?.error.code).toBe("unsupported_event");
    expect(integrity(collected)[0]?.code).toBe("unsupported_event");
  });
});

describe("projectLedger: books and catalogue references", () => {
  it("rejects buys in the bucket until theses exist, cross-book operations and unknown ids", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_bucket", asset_id: "ast_spec", currency: "USD" });
    expect(failure(b.build()).code).toBe("thesis_required");

    const c = new LedgerBuilder();
    catalogue(c);
    c.buy({ account_id: "acc_bucket", asset_id: "ast_world" });
    expect(failure(c.build()).code).toBe("book_mismatch");

    const d = new LedgerBuilder();
    catalogue(d);
    d.buy({ account_id: "acc_none", asset_id: "ast_world" });
    expect(failure(d.build()).code).toBe("unknown_account");

    const e = new LedgerBuilder();
    catalogue(e);
    e.buy({ account_id: "acc_fund", asset_id: "ast_none" });
    expect(failure(e.build()).code).toBe("unknown_asset");
  });

  it("resolves references against the complete catalogue and tracks usage", () => {
    const b = new LedgerBuilder();
    b.account("acc_fund");
    b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    b.asset("ast_world");
    b.assetUpdated({
      asset_id: "ast_world",
      asset_type: "fund",
      book: "core",
      asset_class: "equity",
      isin: "XX0000000002",
      name: "ast_world",
      currency: "EUR",
      transferable: true,
      active: true,
    });
    const state = projectLedger(b.build());
    expect(positionOf(state, "acc_fund", "ast_world").toString()).toBe("10");
    expect(state.assets.get("ast_world")?.identifier_history).toHaveLength(1);
    expect(state.usage.accounts.has("acc_fund")).toBe(true);
    expect(state.usage.assets.has("ast_world")).toBe(true);
    b.accountUpdated({
      account_id: "acc_fund",
      name: "x",
      platform: "test",
      book: "bucket",
      base_currency: "EUR",
      country: "ES",
      active: true,
    });
    expect(failure(b.build()).code).toBe("account_book_change");
  });
});

describe("projectLedger: orders", () => {
  it("fills, cancels and annotates orders", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const order = b.orderPlaced({ account_id: "acc_fund", asset_id: "ast_world" });
    const other = b.orderPlaced({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      quantity: "3",
      notes: "note 0",
    });
    const before = projectLedger(b.build());
    expect(pendingOrders(before, "2027-07-11").map((o) => [o.order_id, o.days_open])).toEqual([
      [order.id, 10],
      [other.id, 10],
    ]);
    const buy = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      order_id: order.id,
      value_date: "2027-07-03",
    });
    b.orderUpdated({
      order_id: other.id,
      stage: "note",
      date: "2027-07-04",
      notes: "still waiting",
    });
    b.orderUpdated({ order_id: other.id, stage: "cancelled", date: "2027-07-05" });
    const state = projectLedger(b.build());
    expect(state.orders.get(order.id)).toMatchObject({
      stage: "filled",
      closed_by: buy.id,
      closed_on: "2027-07-03",
    });
    expect(state.orders.get(other.id)).toMatchObject({
      stage: "cancelled",
      notes: ["note 0", "still waiting"],
      closed_on: "2027-07-05",
    });
    expect(pendingOrders(state, "2027-08-01")).toEqual([]);
  });

  it("rejects mismatched, closed and unknown orders", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const order = b.orderPlaced({ account_id: "acc_fund", asset_id: "ast_bonds" });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      order_id: order.id,
      value_date: "2027-07-03",
    });
    expect(failure(b.build()).code).toBe("order_mismatch");

    const c = new LedgerBuilder();
    catalogue(c);
    const cancelled = c.orderPlaced({ account_id: "acc_fund", asset_id: "ast_world" });
    c.orderUpdated({ order_id: cancelled.id, stage: "cancelled", date: "2027-07-02" });
    c.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      order_id: cancelled.id,
      value_date: "2027-07-03",
    });
    expect(failure(c.build()).code).toBe("order_closed");

    const d = new LedgerBuilder();
    catalogue(d);
    d.orderUpdated({ order_id: "01ARYZ6S41TSV4RRFFQ69G5FZZ", stage: "note", date: "2027-07-02" });
    expect(failure(d.build()).code).toBe("unknown_order");

    const e = new LedgerBuilder();
    catalogue(e);
    e.orderPlaced({ account_id: "acc_bucket", asset_id: "ast_world" });
    expect(failure(e.build()).code).toBe("book_mismatch");
  });
});

describe("projectLedger: transfers", () => {
  const twoLots = (b: LedgerBuilder) => {
    const first = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2027-01-10",
    });
    const second = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      value_date: "2027-02-01",
      quantity: "5",
      unit_price: "120",
    });
    return { first, second };
  };

  it("keeps acquisition dates and cost through a partial fund transfer", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const { first, second } = twoLots(b);
    const request = b.transferRequested({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      to_account_id: "acc_fund",
      to_asset_id: "ast_bonds",
      quantity_out: "12",
      requested_date: "2027-03-01",
    });
    b.transferRequestUpdated({
      request_id: request.id,
      stage: "redeemed",
      date: "2027-03-03",
      nav_out: "105",
    });
    const pendingState = projectLedger(b.build());
    expect(pendingTransfers(pendingState, "2027-03-04").map((t) => [t.stage, t.days_open])).toEqual(
      [["redeemed", 3]],
    );
    const transfer = b.transfer({
      request_id: request.id,
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      quantity_out: "12",
      nav_out: "105",
      value_date_out: "2027-03-03",
      to_account_id: "acc_fund",
      to_asset_id: "ast_bonds",
      quantity_in: "9",
      nav_in: "140",
      value_date_in: "2027-03-05",
    });
    const state = projectLedger(b.build());
    expect(positionOf(state, "acc_fund", "ast_world").toString()).toBe("3");
    expect(positionOf(state, "acc_fund", "ast_bonds").toString()).toBe("9");
    const bonds = fiscalLots(state, "ast_bonds");
    expect(
      bonds.map((lot) => [
        lot.id,
        lot.acquisition_date,
        lot.quantity.toString(),
        lot.cost_eur.amount.toString(),
        lot.source_lot_id,
      ]),
    ).toEqual([
      [`${transfer.id}#0`, "2027-01-10", "7.5", "1000", `${first.id}#0`],
      [`${transfer.id}#1`, "2027-02-01", "1.5", "240", `${second.id}#0`],
    ]);
    expect(realizedGains(state, 2027)).toEqual([]);
    expect(state.transferRequests.get(request.id)).toMatchObject({
      stage: "completed",
      closed_by: transfer.id,
    });
    expect(state.transferRequests.get(request.id)?.updates).toHaveLength(2);
    expect(pendingTransfers(state, "2027-04-01")).toEqual([]);
    expect(integrity(state)).toEqual([]);
  });

  it("moves custody without touching lots and warns about the split holding", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    goldTrades(b);
    b.transfer({
      from_account_id: "acc_etf",
      from_asset_id: "ast_gold",
      quantity_out: "2",
      value_date_out: "2027-02-01",
      to_account_id: "acc_fund",
      to_asset_id: "ast_gold",
      quantity_in: "2",
      value_date_in: "2027-02-03",
    });
    const state = projectLedger(b.build());
    expect(positionOf(state, "acc_etf", "ast_gold").toString()).toBe("1");
    expect(positionOf(state, "acc_fund", "ast_gold").toString()).toBe("2");
    expect(fiscalLots(state, "ast_gold")).toHaveLength(1);
    expect(openQuantity(state, "ast_gold").toString()).toBe("3");
    expect(state.warnings.map((w) => w.code)).toEqual(["same_asset_two_accounts"]);
    expect(integrity(state)).toEqual([]);
  });

  it("rejects non-transferable, cross-book, oversized and mismatched transfers", () => {
    const base = () => {
      const b = new LedgerBuilder();
      catalogue(b);
      goldTrades(b);
      twoLots(b);
      return b;
    };
    const fields = {
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      quantity_out: "2",
      nav_out: "1",
      value_date_out: "2027-03-03",
      to_account_id: "acc_fund",
      to_asset_id: "ast_bonds",
      quantity_in: "2",
      nav_in: "1",
      value_date_in: "2027-03-05",
    };
    let b = base();
    b.transfer({ ...fields, from_account_id: "acc_etf", from_asset_id: "ast_gold" });
    expect(failure(b.build()).code).toBe("not_transferable");
    b = base();
    b.transfer({ ...fields, to_account_id: "acc_bucket", to_asset_id: "ast_spec" });
    expect(failure(b.build()).code).toBe("book_mismatch");
    b = base();
    b.transfer({ ...fields, quantity_out: "20", quantity_in: "20" });
    expect(failure(b.build()).code).toBe("insufficient_position");
    b = base();
    const request = b.transferRequested({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      to_account_id: "acc_etf",
      to_asset_id: "ast_bonds",
      amount_eur: "100",
      requested_date: "2027-03-01",
    });
    b.transfer({ ...fields, request_id: request.id });
    expect(failure(b.build()).code).toBe("request_mismatch");
    b = base();
    b.transfer({ ...fields, request_id: "01ARYZ6S41TSV4RRFFQ69G5FZZ" });
    expect(failure(b.build()).code).toBe("unknown_request");
  });

  it("rejects updates to closed or unknown requests and non-transferable requests", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const request = b.transferRequested({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      to_account_id: "acc_fund",
      to_asset_id: "ast_bonds",
      quantity_out: "1",
      requested_date: "2027-03-01",
    });
    b.transferRequestUpdated({ request_id: request.id, stage: "subscribed", date: "2027-03-02" });
    b.transferRequestUpdated({ request_id: request.id, stage: "cancelled", date: "2027-03-03" });
    const state = projectLedger(b.build());
    expect(state.transferRequests.get(request.id)).toMatchObject({ stage: "cancelled" });
    expect(pendingTransfers(state, "2027-03-04")).toEqual([]);
    b.transferRequestUpdated({ request_id: request.id, stage: "redeemed", date: "2027-03-04" });
    expect(failure(b.build()).code).toBe("request_closed");

    const c = new LedgerBuilder();
    catalogue(c);
    c.transferRequestUpdated({
      request_id: "01ARYZ6S41TSV4RRFFQ69G5FZZ",
      stage: "redeemed",
      date: "2027-03-04",
    });
    expect(failure(c.build()).code).toBe("unknown_request");

    const d = new LedgerBuilder();
    catalogue(d);
    d.transferRequested({
      from_account_id: "acc_etf",
      from_asset_id: "ast_gold",
      to_account_id: "acc_fund",
      to_asset_id: "ast_world",
      quantity_out: "1",
      requested_date: "2027-03-01",
    });
    expect(failure(d.build()).code).toBe("not_transferable");
  });
});

describe("projectLedger: cash, income and valuations", () => {
  it("projects dividends, interest, fx exchanges, deposits, withdrawals and fees", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.dividend({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      gross: "10",
      withholding_origin: "1.5",
      withholding_spain: "1.9",
      currency: "USD",
      fx_rate: "1.0850",
    });
    b.interest({ account_id: "acc_etf", gross: "5", withholding_spain: "0.95" });
    b.fx({ account_id: "acc_etf" });
    b.deposit({ account_id: "acc_fund" });
    b.withdrawal({ account_id: "acc_fund" });
    b.fee({ account_id: "acc_fund" });
    b.valuation({ account_id: "acc_etf", asset_id: "ast_gold", currency: "USD", fx_rate: "1.09" });
    const state = projectLedger(b.build());
    expect(
      cashBalances(state)
        .map((c) => `${c.account_id}|${c.currency}=${c.balance.amount}`)
        .sort(),
    ).toEqual(["acc_etf|EUR=-1080.95", "acc_etf|USD=1174.6", "acc_fund|EUR=4897"]);
    const income = investmentIncome(state, 2027);
    expect(
      income.map((i) => [i.kind, i.net.amount.toString(), i.net_eur.amount.toString()]),
    ).toEqual([
      ["dividend", "6.6", "6.0829493088"],
      ["interest", "4.05", "4.05"],
    ]);
    expect(income[0]?.asset_id).toBe("ast_gold");
    expect(income[1]?.asset_id).toBeUndefined();
    expect(investmentIncome(state, 2026)).toEqual([]);
    expect(state.valuations).toHaveLength(1);
  });

  it("warns about currency and fx date inconsistencies", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      currency: "EUR",
      fx_rate_date: "2027-01-11",
    });
    const state = projectLedger(b.build());
    expect(state.warnings.map((w) => w.code)).toEqual([
      "currency_mismatch",
      "fx_rate_date_after_fiscal_date",
    ]);
  });

  it("indexes fingerprints and reports duplicates in the integrity check", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const first = b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const second = b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const state = projectLedger(b.build());
    expect(state.fingerprints.get(first.fingerprint)).toEqual([first.id, second.id]);
    expect(integrity(state)).toEqual([
      expect.objectContaining({
        code: "duplicate_fingerprint",
        severity: "warning",
        event_ids: [first.id, second.id],
      }),
    ]);
  });
});

describe("projectLedger: sells across lots, withholding and sell orders", () => {
  it("allocates proceeds across consumed lots so the shares add up exactly", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "3", unit_price: "100" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "3", unit_price: "200" });
    const order = b.orderPlaced({
      account_id: "acc_fund",
      asset_id: "ast_world",
      side: "sell",
      quantity: "4",
      requested_date: "2027-06-01",
    });
    const sell = b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "4",
      unit_price: "250",
      fee: "1",
      withholding: "19",
      order_id: order.id,
    });
    const state = projectLedger(b.build());
    const [gain] = realizedGains(state, 2027);
    expect(
      gain?.by_lot.map((lot) => [
        lot.quantity.toString(),
        lot.proceeds_eur.amount.toString(),
        lot.cost_eur.amount.toString(),
      ]),
    ).toEqual([
      ["3", "749.25", "300"],
      ["1", "249.75", "200"],
    ]);
    expect(gain?.proceeds_eur.amount.toString()).toBe("999");
    expect(gain?.gain_eur.amount.toString()).toBe("499");
    expect(cashBalances(state)[0]?.balance.amount.toString()).toBe("80");
    expect(state.orders.get(order.id)).toMatchObject({ stage: "filled", closed_by: sell.id });
  });
});

describe("integrity on corrupted states", () => {
  it("reports negative positions and lot mismatches", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const state = projectLedger(b.build());
    state.positions.set("acc_fund|ast_world", Quantity.parse("-1"));
    expect(integrity(state).map((f) => f.code)).toEqual(["negative_position", "lots_mismatch"]);
    state.positions.delete("acc_fund|ast_world");
    expect(integrity(state).map((f) => f.code)).toEqual(["lots_mismatch"]);
  });

  it("refuses a sell whose lots do not cover the position", () => {
    const state = createEmptyState(DEFAULT_SETTINGS);
    const b = new LedgerBuilder();
    applyAccountCreated(state, b.account("acc_fund"));
    applyAssetCreated(state, b.asset("ast_world"));
    adjustPosition(state, "acc_fund", "ast_world", Quantity.parse("5"), "x");
    expect(() =>
      applySell(state, b.sell({ account_id: "acc_fund", asset_id: "ast_world" })),
    ).toThrow(expect.objectContaining({ code: "insufficient_lots" }));
  });
});

describe("toProjectionError", () => {
  it("passes projection errors, wraps domain errors and rethrows anything else", () => {
    const b = new LedgerBuilder();
    const event = b.account("acc_fund");
    const projection = new ProjectionError("x", event.id, "x");
    expect(toProjectionError(event, projection)).toBe(projection);
    const wrapped = toProjectionError(
      event,
      new ValidationError("invalid_decimal", "bad", { field: "fee" }),
    );
    expect(wrapped).toBeInstanceOf(ProjectionError);
    expect(wrapped.code).toBe("invalid_decimal");
    expect(wrapped.details).toEqual({ field: "fee", event_id: event.id });
    expect(wrapped).toBeInstanceOf(DomainError);
    expect(() => toProjectionError(event, new TypeError("bug"))).toThrow(TypeError);
  });
});
