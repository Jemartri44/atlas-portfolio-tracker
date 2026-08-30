import { describe, expect, it } from "vitest";
import { fiscalLots } from "../../src/projections/lots.js";
import { pendingOrders, pendingTransfers } from "../../src/projections/pending.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { snapshotOf } from "../../src/projections/snapshot.js";
import type { FiscalLot } from "../../src/projections/state.js";
import type {
  AssetUpdatedEvent,
  BuyEvent,
  CorporateActionEvent,
  DividendEvent,
  EventOf,
  OrderUpdatedEvent,
  SellEvent,
  SupportedEvent,
} from "../../src/schema/events.js";
import { decodeLine, encodeLine } from "../../src/schema/line.js";
import { generateLedger } from "../../src/synth/scenario.js";
import { summarizeLedger } from "../../src/synth/summary.js";
import { fixtureLines, fixtureText } from "../fixtures-path.js";
import { checkInvariants } from "./invariants.js";

const events = generateLedger({ seed: 1 });
const state = projectLedger(events);
const ofType = <T extends SupportedEvent["type"]>(type: T): EventOf<T>[] =>
  events.filter((event) => event.type === type) as EventOf<T>[];

describe("generateLedger: determinism and invariants (seed 1)", () => {
  it("is byte-identical for the same seed and differs for another", () => {
    const again = generateLedger({ seed: 1 });
    expect(again.map(encodeLine)).toEqual(events.map(encodeLine));
    expect(generateLedger({ seed: 2 }).map(encodeLine)).not.toEqual(events.map(encodeLine));
  });

  it("projects cleanly, prefix by prefix, with exactly the declared warnings", () => {
    const started = performance.now();
    checkInvariants(events, "all");
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(60_000);
  });
});

describe("generateLedger: golden file (frozen once merged, prompt decision (i))", () => {
  it("reproduces tests/fixtures/ledger/synthetic-v1.jsonl byte for byte", () => {
    expect(events.map((event) => `${encodeLine(event)}\n`).join("")).toBe(
      fixtureText("synthetic-v1.jsonl"),
    );
  });

  it("projects the fixture to tests/fixtures/ledger/synthetic-v1.snapshot.json", () => {
    const fixture = fixtureLines("synthetic-v1.jsonl").map((line) => decodeLine(line).event);
    expect(`${JSON.stringify(snapshotOf(projectLedger(fixture)), null, 2)}\n`).toBe(
      fixtureText("synthetic-v1.snapshot.json"),
    );
  });
});

describe("generateLedger: the scenario contains every rare case", () => {
  it("covers every event type of data-schema.md §3 and the catalogue of the plan", () => {
    const summary = summarizeLedger(events);
    expect(Object.keys(summary.by_type).sort()).toEqual(
      [
        "account_created",
        "asset_created",
        "asset_updated",
        "settings_changed",
        "buy",
        "sell",
        "transfer",
        "dividend",
        "corporate_action",
        "cash_deposit",
        "cash_withdrawal",
        "fx_exchange",
        "interest",
        "standalone_fee",
        "valuation",
        "order_placed",
        "order_updated",
        "transfer_requested",
        "transfer_request_updated",
        "reversal",
        "thesis_opened",
        "thesis_closed",
      ].sort(),
    );
    expect(summary.accounts).toEqual(["acc_bucket", "acc_ibkr", "acc_ibkr2", "acc_mi"]);
    expect(summary.assets).toHaveLength(13);
    expect(summary.years).toEqual([2026, 2027, 2028]);
    const types = new Set(ofType("asset_created").map((asset) => asset.asset_type));
    expect([...types].sort()).toEqual(["etc", "etp", "fund", "money_market", "stock"]);
    expect(state.accounts.get("acc_bucket")?.book).toBe("bucket");
    expect(state.settingsHistory).toHaveLength(2);
    expect(state.settingsHistory[1]?.settings.target_weights?.equity).toBe("55");
  });

  it("changes an identifier and deactivates the delisted asset", () => {
    const updates = ofType("asset_updated");
    expect(updates.map((u: AssetUpdatedEvent) => [u.asset_id, u.active])).toEqual([
      ["ast_world", true],
      ["ast_alpha_spin", false],
    ]);
    expect(state.assets.get("ast_world")?.identifier_history).toEqual([
      { isin: "XX0000000001", until_event_id: updates[0]?.id },
    ]);
    expect(state.assets.get("ast_world")?.isin).toBe("XX0000000011");
    expect(state.assets.get("ast_alpha_spin")?.active).toBe(false);
  });

  it("subscribes to funds through orders: amount without unit_price at D+2, one pending, one cancelled", () => {
    const fundBuys = ofType("buy").filter((buy: BuyEvent) => buy.order_id !== undefined);
    expect(fundBuys.length).toBeGreaterThanOrEqual(30);
    for (const buy of fundBuys) {
      expect(buy.amount).toBeDefined();
      expect(buy.unit_price).toBeUndefined();
      expect(buy.value_date > buy.trade_date).toBe(true);
    }
    expect(pendingOrders(state, "2029-01-31")).toHaveLength(1);
    expect(ofType("order_updated").map((u: OrderUpdatedEvent) => u.stage)).toEqual(["cancelled"]);
    expect([...state.orders.values()].filter((order) => order.stage === "cancelled")).toHaveLength(
      1,
    );
  });

  it("chains two partial fund transfers, keeps one request pending and moves custody of the ETC", () => {
    const transfers = ofType("transfer");
    expect(transfers.map((t) => `${t.from_asset_id}>${t.to_asset_id}`)).toEqual([
      "ast_world>ast_smallcap",
      "ast_gold>ast_gold",
      "ast_smallcap>ast_bonds",
    ]);
    expect(
      transfers.every((t) => t.from_asset_id === t.to_asset_id || t.request_id !== undefined),
    ).toBe(true);
    expect(pendingTransfers(state, "2029-01-31")).toHaveLength(1);
    expect(
      [...state.transferRequests.values()].filter((r) => r.stage === "completed"),
    ).toHaveLength(2);
    const bondsLots = fiscalLots(state, "ast_bonds_i").filter(
      (lot) => lot.source_lot_id !== undefined,
    );
    expect(bondsLots.length).toBeGreaterThan(0);
    // The chain world → smallcap → bonds → bonds_i keeps the original acquisition dates.
    // Every lot of the last fund in the chain traces back, date intact, to a lot of ast_world.
    const lotById = (id: string) => fiscalLots(state).find((lot) => lot.id === id);
    const roots = new Set<string>();
    for (const lot of bondsLots) {
      let current = lot;
      while (current.source_lot_id !== undefined) {
        const source = lotById(current.source_lot_id) as FiscalLot;
        expect(source.acquisition_date).toBe(lot.acquisition_date);
        current = source;
      }
      roots.add(current.asset_id);
    }
    // Direct contributions to the bond fund, plus the chain world → smallcap → bonds → bonds_i.
    expect([...roots].sort()).toEqual(["ast_bonds", "ast_world"]);
    expect(state.positions.get("acc_ibkr2|ast_gold")?.toString()).toBe("1");
    expect(state.positions.get("acc_ibkr|ast_gold")?.toString()).toBe("1");
  });

  it("registers every corporate action kind of the scenario with cash-outs in two accounts", () => {
    const actions = ofType("corporate_action");
    expect(actions.map((a: CorporateActionEvent) => a.kind)).toEqual([
      "reverse_split",
      "spin_off",
      "split",
      "merger",
      "delisting",
      "fund_merger",
      "share_class_change",
    ]);
    const reverse = actions[0] as CorporateActionEvent;
    const picos = reverse.effects[1] as { per_account: { account_id: string }[] };
    expect(picos.per_account.map((entry) => entry.account_id)).toEqual(["acc_ibkr", "acc_ibkr2"]);
    expect(state.gains.filter((gain) => gain.event_id === reverse.id)).toHaveLength(2);
    const merged = fiscalLots(state, "ast_smallcap_b");
    expect(merged.every((lot) => lot.source_lot_id !== undefined)).toBe(true);
  });

  it("books a loss sale followed by contributions, a late buy consumed first and a 30/12 → 02/01 sale", () => {
    const sells = ofType("sell");
    const worldSale = sells.find((sell: SellEvent) => sell.asset_id === "ast_world") as SellEvent;
    const worldGain = state.gains.find((gain) => gain.event_id === worldSale.id);
    expect(worldGain?.gain_eur.isNegative()).toBe(true);
    expect(worldGain?.year).toBe(2027);
    const lateBuy = ofType("buy").find(
      (buy: BuyEvent) => buy.value_date === "2026-08-28",
    ) as BuyEvent;
    expect(events.indexOf(lateBuy)).toBeGreaterThan(events.indexOf(worldSale));
    expect(worldGain?.by_lot[0]?.lot_id).toBe(`${lateBuy.id}#0`);
    const later = ofType("buy").filter(
      (buy: BuyEvent) =>
        buy.asset_id === "ast_world" &&
        buy.value_date > worldSale.value_date &&
        buy.value_date < "2028-01-01",
    );
    expect(later.length).toBeGreaterThan(0);
    const alphaSale = sells.find((sell: SellEvent) => sell.asset_id === "ast_alpha") as SellEvent;
    expect([alphaSale.trade_date, alphaSale.value_date]).toEqual(["2027-12-30", "2028-01-02"]);
    expect(state.gains.find((gain) => gain.event_id === alphaSale.id)?.year).toBe(2027);
  });

  it("closes a thesis with gain and one with loss and leaves one open with a live position", () => {
    const theses = [...state.theses.values()];
    const byId = Object.fromEntries(theses.map((thesis) => [thesis.thesis_id, thesis]));
    expect(byId.th_alpha?.status).toBe("closed");
    expect(byId.th_alpha?.result_eur.amount.isPositive()).toBe(true);
    expect(byId.th_beta_new?.status).toBe("closed");
    expect(byId.th_beta_new?.result_eur.amount.isNegative()).toBe(true);
    expect(byId.th_gamma?.status).toBe("open");
    expect(state.positions.get("acc_bucket|ast_gamma")?.isPositive()).toBe(true);
    expect(byId.th_gamma?.buys).toHaveLength(2);
  });

  it("corrects a prior-year dividend in the following year and values foreign accounts at 31/12", () => {
    const reversal = ofType("reversal")[0];
    const corrected = ofType("dividend").find(
      (div: DividendEvent) => div.corrects_id !== undefined,
    ) as DividendEvent;
    expect(corrected.corrects_id).toBe(reversal?.reverses_id);
    expect(corrected.value_date.startsWith("2027")).toBe(true);
    expect(corrected.recorded_at.startsWith("2028")).toBe(true);
    expect(state.reversed.get(corrected.corrects_id as string)).toBe(reversal?.id);
    const valuations = ofType("valuation");
    expect([...new Set(valuations.map((v) => v.date))]).toEqual([
      "2026-12-31",
      "2027-12-31",
      "2028-12-31",
    ]);
    expect(valuations.every((v) => v.account_id !== "acc_mi")).toBe(true);
    expect(ofType("fx_exchange")).toHaveLength(2);
    expect(ofType("interest")).toHaveLength(2);
    expect(ofType("standalone_fee")).toHaveLength(2);
    expect(ofType("cash_withdrawal")).toHaveLength(1);
    const dividend = ofType("dividend")[0] as DividendEvent;
    expect(dividend.currency).toBe("USD");
    expect(Number(dividend.withholding_origin)).toBeGreaterThan(0);
    expect(Number(dividend.withholding_spain)).toBeGreaterThan(0);
  });
});
