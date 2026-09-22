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
  SettingsChangedEvent,
  SupportedEvent,
} from "../../src/schema/events.js";
import { ASSET_TYPES } from "../../src/schema/events.js";
import { decodeLine, encodeLine } from "../../src/schema/line.js";
import { generateLedger } from "../../src/synth/scenario.js";
import { summarizeLedger } from "../../src/synth/summary.js";
import { taxYear } from "../../src/tax/year.js";
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
  }, 60_000);
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
  /**
   * Every type but two, and both absences are deliberate.
   *
   * `swap` (feature 008) is not here because the scenario has no crypto asset
   * to swap, so adding one would mean new asset, purchase and valuation events
   * — and a side stream protects the ids but **not** the snapshot: an event
   * dated in the middle of the scenario moves lots, gains and warnings of
   * everything after it. It is covered in `projections/swap.test.ts` instead.
   *
   * `tax_return_filed` is defined by ADR-0020 and implemented in phase 5.
   */
  it("covers every event type of data-schema.md §3 but the two it cannot", () => {
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
    expect(summary.assets).toHaveLength(15);
    expect(summary.years).toEqual([2026, 2027, 2028]);
    const types = new Set(ofType("asset_created").map((asset) => asset.asset_type));
    expect([...types].sort()).toEqual(["etc", "etp", "fund", "money_market", "stock"]);
    expect(state.accounts.get("acc_bucket")?.book).toBe("bucket");
    expect(state.settingsHistory).toHaveLength(3);
    expect(state.settingsHistory[0]?.settings.target_weights?.ast_world).toBe("45");
    expect(state.settingsHistory[1]?.settings.target_weights?.ast_world).toBe("40");
    // After the fund merger and the share-class change the plan names the
    // surviving assets, so the contribution never proposes a fund that is gone.
    expect(state.settingsHistory[2]?.settings.target_weights?.ast_smallcap_b).toBe("10");
    expect(state.settingsHistory[2]?.settings.target_weights?.ast_smallcap).toBeUndefined();
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

  it("gives the bucket the sample phase 3 needs: seven closed theses and two open", () => {
    const theses = [...state.theses.values()];
    const closed = theses.filter((thesis) => thesis.status === "closed");
    const open = theses.filter((thesis) => thesis.status === "open");
    expect(closed.length).toBeGreaterThanOrEqual(6);
    expect(open).toHaveLength(2);
    // Winners and losers, and one thesis that bought twice on different dates.
    expect(closed.some((thesis) => thesis.result_eur.amount.isPositive())).toBe(true);
    expect(closed.some((thesis) => thesis.result_eur.amount.isNegative())).toBe(true);
    const byId = Object.fromEntries(theses.map((thesis) => [thesis.thesis_id, thesis]));
    expect(byId.th_delta_1?.buys).toHaveLength(2);
    expect(byId.th_delta_1?.buys[0]?.fiscal_date).not.toBe(byId.th_delta_1?.buys[1]?.fiscal_date);
  });

  it("repurchases inside the window after a loss, which is what §3.6 has to warn about", () => {
    const repurchases = state.warnings.filter(
      (warning) => warning.code === "wash_sale_window_repurchase",
    );
    expect(repurchases.some((warning) => warning.details.asset_id === "ast_delta")).toBe(true);
    // And the ledger keeps the purchase: it is a warning, not a rejection.
    expect(state.positions.get("acc_bucket|ast_delta")?.isPositive()).toBe(true);
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
    // Year ends for the Modelo 720 and the phase-2 views, plus the half-yearly
    // prices of the benchmark and the price of the open bucket position, which
    // the phase-3 metrics need (feature 005).
    expect([...new Set(valuations.map((v) => v.date))].sort()).toEqual([
      "2026-09-01",
      "2026-12-31",
      "2027-03-01",
      "2027-09-01",
      "2027-12-31",
      "2028-03-01",
      "2028-09-01",
      "2028-12-31",
    ]);
    const benchmark = valuations.filter((v) => v.asset_id === "ast_world");
    expect(benchmark.length).toBeGreaterThanOrEqual(5);
    // Priced before the first event of the bucket, or the first thesis would
    // have no P(d_i) to compare against.
    expect(benchmark.some((v) => v.date <= "2026-09-04")).toBe(true);
    // Foreign accounts for the Modelo 720, and the fund account so the phase-2
    // projections have a price for every core asset held (feature 004).
    expect(new Set(valuations.map((v) => v.account_id))).toEqual(
      new Set(["acc_ibkr", "acc_ibkr2", "acc_bucket", "acc_mi"]),
    );
    // Every valuation carries the publication date of its ECB rate: required
    // since ADR-0021, in euros too. Without it the 31/12 rate dated the currency
    // with the business date and `atlas networth` had to label the cash rows
    // "(fecha de la operación)" on the very day the rate was published for.
    const inCurrency = valuations.filter((v) => v.currency !== "EUR");
    expect(inCurrency).toHaveLength(10);
    expect(valuations.every((v) => v.fx_rate_date !== undefined)).toBe(true);
    // 31/12/2028 is a Sunday, and the ECB publishes nothing: the rate that
    // applies to those nine valuations is Friday 2028-12-29's. It is the case
    // that made the field exist (challenge 3, finding 6), and six of the nine
    // only got the date when ADR-0021 made it required in euros too.
    const yearEnd2028 = valuations.filter((v) => v.date === "2028-12-31");
    expect(yearEnd2028).toHaveLength(9);
    expect(yearEnd2028.every((v) => v.fx_rate_date === "2028-12-29")).toBe(true);
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

describe("the settings the scenario writes: a second table, on purpose", () => {
  /**
   * The scenario writes its own wash-sale window instead of reading the
   * documented default, so that moving a default never rewrites a frozen
   * fixture. The price of that is drift, and this is the guard against it: the
   * table has to name **every asset type except `etf`**, which is left out
   * deliberately so the golden exercises the fallback and the report lists it
   * in `settings.from_code`.
   */
  it("names every asset type except etf, so nothing else rides a default unnoticed", () => {
    const settings = generateLedger({ seed: 1 }).find(
      (event) => event.type === "settings_changed",
    ) as SettingsChangedEvent;
    const named = Object.keys(settings.settings.wash_sale_window).sort();
    expect(named).toEqual(ASSET_TYPES.filter((type) => type !== "etf").sort());
    // And the fiscal date rule, for the same reason.
    expect(Object.keys(settings.settings.fiscal_date_rule).sort()).toEqual(
      ASSET_TYPES.filter((type) => type !== "etf").sort(),
    );
  });

  /**
   * The **third** family the engine reads, `income_category`, which the guard
   * above did not cover: the scenario writes none of it, so the golden report
   * reads the documented default for all seven types.
   *
   * That is not something this test can fix by pinning it: the settings line
   * lives in the frozen `.jsonl` (prompt 003, decision (i)) and writing a
   * family into it would rewrite the fixture. What it can do is **say it out
   * loud and hold it**, because the consequence is real and already happened:
   * moving `DEFAULT_INCOME_CATEGORY.etc` in block 0 of feature 010 moved the
   * golden report, and the only thing standing between that and a silent
   * rewrite is the prediction written before regenerating. If somebody ever
   * writes a partial family here, this fails and the prediction gets written.
   */
  it("writes no income category, so the golden reads the documented default for all seven", () => {
    const settings = generateLedger({ seed: 1 }).find(
      (event) => event.type === "settings_changed",
    ) as SettingsChangedEvent;
    expect(settings.settings.income_category).toBeUndefined();
    // And the report says so, type by type, where the reader can see it.
    const fromCode = taxYear(generateLedger({ seed: 1 }), 2027, { today: "2030-01-01" }).settings
      .from_code;
    expect(fromCode.filter((entry) => entry.startsWith("income_category.")).sort()).toEqual(
      ASSET_TYPES.map((type) => `income_category.${type}`).sort(),
    );
  });
});
