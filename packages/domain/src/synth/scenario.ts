// The synthetic scenario (specs/003-synthetic-data/data-model.md §6): a fixed
// skeleton of accounts, assets and monthly blocks from 2026-09 to 2028-12 that
// contains every event type and every rare case the later features need, with
// amounts, prices, rates and day-of-month jitter drawn from the seed. Nothing
// here is real: invented ids, ISINs `XX…`, round amounts.

import type { CivilDate } from "../dates/civil-date.js";
import { Decimal } from "../money/decimal.js";
import type {
  AccountId,
  AssetCreatedEvent,
  AssetId,
  AssetUpdatedEvent,
  BuyEvent,
  CorporateActionEvent,
  DividendEvent,
  Draft,
  LedgerEvent,
  SellEvent,
  ValuationEvent,
} from "../schema/events.js";
import { DEFAULT_SETTINGS, type Settings } from "../settings/settings.js";
import { ScenarioBuilder } from "./builder.js";
import { addDays, dateOf, monthAt } from "./calendar.js";
import { Prng } from "./random.js";

export interface GenerateOptions {
  seed: number;
}

/** Warning codes the scenario provokes on purpose (Q1): the ETC held in two IBKR accounts. */
export const SYNTHETIC_EXPECTED_WARNINGS: readonly string[] = ["same_asset_two_accounts"];

const MONTHS = 28; // 2026-09 … 2028-12
const START_DEPOSIT_DATE = "2026-08-25";
const LATE_BUY_DATE = "2026-08-28";

const d = (text: string | number): Decimal => Decimal.parse(String(text));
const mul = (a: string, b: string): string => d(a).mul(d(b)).toString();
const pct = (amount: string, rate: string): string => d(amount).mul(d(rate)).round(2).toString();
const cents = (value: Decimal): string => value.round(2).toString();
const units = (value: Decimal): string => value.round(4).toString();
/** Smallest integer not below `value`, as a string (positive values). */
const ceil = (value: Decimal): string => {
  const rounded = value.round(0);
  return (rounded.lt(value) ? rounded.add(Decimal.ONE) : rounded).toString();
};

/** Every seed-dependent parameter, drawn once in a fixed order before any event is recorded. */
interface Params {
  worldAmount: string;
  bondsAmount: string;
  mmAmount: string;
  goldTransferred: number;
  goldKept: number;
  goldPrice: string;
  btcQuantity: number;
  btcPrice: string;
  alphaQuantity: number;
  alphaPrice: string;
  betaQuantity: number;
  betaPrice: string;
  gammaQuantity: number;
  gammaPrice: string;
  gammaSecondQuantity: number;
  fx: string;
}

const NOT_MULTIPLE_OF_FOUR = [1, 2, 3, 5, 6, 7];
const NOT_MULTIPLE_OF_FOUR_LOTS = [10, 11, 13, 14, 15, 17, 18, 19];
const NOT_MULTIPLE_OF_THREE = [10, 11, 13, 14, 16, 17, 19, 20];

const drawParams = (rng: Prng): Params => ({
  worldAmount: String(rng.int(6, 12) * 50),
  bondsAmount: String(rng.int(2, 6) * 50),
  mmAmount: String(rng.int(20, 40) * 100),
  goldTransferred: rng.pick(NOT_MULTIPLE_OF_FOUR),
  goldKept: rng.pick(NOT_MULTIPLE_OF_FOUR),
  goldPrice: rng.decimal(180, 240, 2),
  btcQuantity: rng.int(2, 6),
  btcPrice: rng.decimal(20, 40, 2),
  alphaQuantity: rng.pick(NOT_MULTIPLE_OF_FOUR_LOTS),
  alphaPrice: rng.decimal(20, 60, 2),
  betaQuantity: rng.pick(NOT_MULTIPLE_OF_THREE),
  betaPrice: rng.decimal(15, 45, 2),
  gammaQuantity: rng.int(5, 15),
  gammaPrice: rng.decimal(30, 80, 2),
  gammaSecondQuantity: rng.int(3, 8),
  fx: rng.decimal(1.05, 1.15, 4),
});

const ACCOUNTS = [
  {
    account_id: "acc_mi",
    name: "Fondos indexados",
    platform: "myinvestor",
    book: "core",
    country: "ES",
  },
  { account_id: "acc_ibkr", name: "ETC y ETP", platform: "ibkr", book: "core", country: "IE" },
  {
    account_id: "acc_ibkr2",
    name: "IBKR secundaria",
    platform: "ibkr",
    book: "core",
    country: "IE",
  },
  {
    account_id: "acc_bucket",
    name: "Cubo especulativo",
    platform: "ibkr",
    book: "bucket",
    country: "IE",
  },
] as const;

type AssetSpec = Omit<Draft<AssetCreatedEvent>, "type" | "active">;

const ASSETS: readonly AssetSpec[] = [
  {
    asset_id: "ast_world",
    asset_type: "fund",
    book: "core",
    asset_class: "equity",
    isin: "XX0000000001",
    name: "World Index Fund",
    currency: "EUR",
    ter: "0.12",
    transferable: true,
  },
  {
    asset_id: "ast_smallcap",
    asset_type: "fund",
    book: "core",
    asset_class: "equity",
    isin: "XX0000000002",
    name: "Small Cap Index Fund",
    currency: "EUR",
    ter: "0.25",
    transferable: true,
  },
  {
    asset_id: "ast_bonds",
    asset_type: "fund",
    book: "core",
    asset_class: "fixed_income",
    isin: "XX0000000003",
    name: "Global Bond Index Fund",
    currency: "EUR",
    ter: "0.10",
    transferable: true,
  },
  {
    asset_id: "ast_mm",
    asset_type: "money_market",
    book: "core",
    asset_class: "fixed_income",
    isin: "XX0000000004",
    name: "Money Market Fund",
    currency: "EUR",
    ter: "0.08",
    transferable: true,
  },
  {
    asset_id: "ast_gold",
    asset_type: "etc",
    book: "core",
    asset_class: "gold",
    isin: "XX0000000005",
    ticker: "GLDX",
    name: "Physical Gold ETC",
    currency: "USD",
    ter: "0.15",
    transferable: false,
  },
  {
    asset_id: "ast_btc",
    asset_type: "etp",
    book: "core",
    asset_class: "crypto",
    isin: "XX0000000006",
    ticker: "BTCX",
    name: "Bitcoin ETP",
    currency: "EUR",
    ter: "0.95",
    transferable: false,
  },
  {
    asset_id: "ast_alpha",
    asset_type: "stock",
    book: "bucket",
    ticker: "ALP",
    name: "Alpha Robotics",
    currency: "USD",
    transferable: false,
  },
  {
    asset_id: "ast_beta",
    asset_type: "stock",
    book: "bucket",
    ticker: "BET",
    name: "Beta Biotech",
    currency: "USD",
    transferable: false,
  },
  {
    asset_id: "ast_gamma",
    asset_type: "stock",
    book: "bucket",
    ticker: "GAM",
    name: "Gamma Semiconductors",
    currency: "USD",
    transferable: false,
  },
];

const LATER_ASSETS: Record<string, AssetSpec> = {
  ast_alpha_spin: {
    asset_id: "ast_alpha_spin",
    asset_type: "stock",
    book: "bucket",
    ticker: "ALPS",
    name: "Alpha Spin-off",
    currency: "USD",
    transferable: false,
  },
  ast_beta_new: {
    asset_id: "ast_beta_new",
    asset_type: "stock",
    book: "bucket",
    ticker: "BETN",
    name: "Beta Holdings",
    currency: "USD",
    transferable: false,
  },
  ast_smallcap_b: {
    asset_id: "ast_smallcap_b",
    asset_type: "fund",
    book: "core",
    asset_class: "equity",
    isin: "XX0000000012",
    name: "Small Cap Index Fund B",
    currency: "EUR",
    ter: "0.20",
    transferable: true,
  },
  ast_bonds_i: {
    asset_id: "ast_bonds_i",
    asset_type: "fund",
    book: "core",
    asset_class: "fixed_income",
    isin: "XX0000000013",
    name: "Global Bond Index Fund I",
    currency: "EUR",
    ter: "0.07",
    transferable: true,
  },
};

const settingsWith = (weights: Record<string, string>, contribution: string): Settings => ({
  ...DEFAULT_SETTINGS,
  target_weights: weights,
  deviation_threshold_pp: "5",
  satellite_min_weight_pct: "2",
  monthly_contribution_eur: contribution,
  bucket_pct_of_contribution: "10",
  bucket_max_cumulative_contribution: "6000",
  bucket_stop_loss_pct: "30",
  bucket_max_weight_pct: "10",
  stale_price_days: 7,
  model_720_alert_threshold_eur: "45000",
  model_721_alert_threshold_eur: "45000",
  savings_tax_brackets: [
    { up_to: "6000", rate_pct: "19" },
    { up_to: "50000", rate_pct: "21" },
    { up_to: "200000", rate_pct: "23" },
    { up_to: "300000", rate_pct: "27" },
    { rate_pct: "30" },
  ],
  tax_residence: "ES",
  notification_email: "atlas@example.invalid",
  job_frequencies: { prices: "daily", reminder: "monthly", reconciliation: "quarterly" },
  transfer_max_days: 15,
});

class Scenario {
  private readonly b: ScenarioBuilder;
  private readonly p: Params;
  private minWorldNav: Decimal | undefined;
  private wrongDividend: DividendEvent | undefined;

  constructor(seed: number) {
    const rng = new Prng(seed);
    this.p = drawParams(rng);
    this.b = new ScenarioBuilder(rng);
  }

  private rate(): string {
    return this.b.rng.decimal(1.05, 1.15, 4);
  }

  // --- catalogue --------------------------------------------------------

  private createAsset(spec: AssetSpec, date: CivilDate): void {
    this.b.record<AssetCreatedEvent>(date, { type: "asset_created", ...spec, active: true });
  }

  private updateAsset(spec: AssetSpec, date: CivilDate, active: boolean): void {
    this.b.record<AssetUpdatedEvent>(date, { type: "asset_updated", ...spec, active });
  }

  private catalogue(date: CivilDate): void {
    this.b.record(date, {
      type: "settings_changed",
      settings: settingsWith(
        { equity: "60", fixed_income: "25", gold: "10", crypto: "5" },
        this.p.worldAmount,
      ),
    });
    for (const account of ACCOUNTS) {
      this.b.record(date, {
        type: "account_created",
        ...account,
        base_currency: "EUR",
        active: true,
      });
    }
    for (const asset of ASSETS) {
      this.createAsset(asset, date);
    }
  }

  // --- cash and operations helpers ---------------------------------------

  private deposit(account_id: AccountId, date: CivilDate, amount: string): void {
    this.b.record(date, {
      type: "cash_deposit",
      account_id,
      value_date: date,
      amount,
      currency: "EUR",
      fx_rate: "1",
    });
  }

  /** Sells `sold` EUR for USD at `rate`; the USD bought cover at least `needUsd` after the fee. */
  private fxToUsd(account_id: AccountId, date: CivilDate, needUsd: Decimal, rate: string): string {
    const sold = ceil(needUsd.add(d("2")).div(d(rate)).div(d("100")).add(d("1")));
    const soldAmount = d(sold).mul(d("100")).toString();
    this.b.record(date, {
      type: "fx_exchange",
      account_id,
      value_date: date,
      sold_amount: soldAmount,
      sold_currency: "EUR",
      bought_amount: mul(soldAmount, rate),
      bought_currency: "USD",
      fee: "2",
      fee_currency: "USD",
      fx_rate_sold: "1",
      fx_rate_bought: rate,
      fx_rate_date: date,
    });
    return soldAmount;
  }

  private buyStock(
    account_id: AccountId,
    asset_id: AssetId,
    trade: CivilDate,
    quantity: number,
    unit_price: string,
    fx_rate: string,
    thesis_id: string,
  ): BuyEvent {
    return this.b.record<BuyEvent>(trade, {
      type: "buy",
      account_id,
      asset_id,
      trade_date: trade,
      value_date: addDays(trade, 2),
      quantity: String(quantity),
      unit_price,
      currency: "USD",
      fx_rate,
      fx_rate_date: trade,
      fee: "1",
      source: "manual",
      thesis_id,
    });
  }

  private sellStock(
    asset_id: AssetId,
    trade: CivilDate,
    value: CivilDate,
    unit_price: string,
    thesis_id: string,
  ): SellEvent {
    return this.b.record<SellEvent>(trade, {
      type: "sell",
      account_id: "acc_bucket",
      asset_id,
      trade_date: trade,
      value_date: value,
      quantity: this.b.position("acc_bucket", asset_id).toString(),
      unit_price,
      currency: "USD",
      fx_rate: this.rate(),
      fx_rate_date: trade,
      fee: "1",
      source: "manual",
      thesis_id,
    });
  }

  private openThesis(
    thesis_id: string,
    asset_id: AssetId,
    plannedEur: Decimal,
    date: CivilDate,
  ): void {
    this.b.record(date, {
      type: "thesis_opened",
      thesis_id,
      account_id: "acc_bucket",
      asset_id,
      hypothesis: `Synthetic thesis on ${asset_id}`,
      expected_horizon_days: 180,
      invalidation: "Synthetic invalidation rule",
      planned_size_eur: ceil(plannedEur.mul(d("1.3"))),
    });
  }

  private closeThesis(thesis_id: string, date: CivilDate): void {
    this.b.record(date, { type: "thesis_closed", thesis_id, closing_notes: `${thesis_id} closed` });
  }

  private dividendAlpha(date: CivilDate, withholdingSpainRate: string): DividendEvent {
    const gross = cents(d(this.p.alphaQuantity).mul(d("0.20")));
    return this.b.record<DividendEvent>(date, {
      type: "dividend",
      account_id: "acc_bucket",
      asset_id: "ast_alpha",
      value_date: date,
      gross,
      withholding_origin: pct(gross, "0.15"),
      withholding_spain: pct(gross, withholdingSpainRate),
      currency: "USD",
      fx_rate: this.rate(),
      fx_rate_date: date,
      per_unit: "0.20",
    });
  }

  private interest(date: CivilDate): void {
    const gross = this.b.rng.decimal(5, 20, 2);
    this.b.record(date, {
      type: "interest",
      account_id: "acc_mi",
      value_date: date,
      gross,
      withholding_spain: pct(gross, "0.19"),
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: date,
    });
  }

  private fee(date: CivilDate, description: string): void {
    this.b.record(date, {
      type: "standalone_fee",
      account_id: "acc_ibkr",
      value_date: date,
      amount: "3",
      currency: "EUR",
      fx_rate: "1",
      description,
    });
  }

  private valuation(
    account_id: AccountId,
    asset_id: AssetId,
    date: CivilDate,
    unit_value: string,
    currency: string,
  ): void {
    const quantity = this.b.position(account_id, asset_id);
    if (quantity.isZero()) {
      return;
    }
    this.b.record<ValuationEvent>(date, {
      type: "valuation",
      account_id,
      asset_id,
      date,
      quantity: quantity.toString(),
      unit_value,
      currency,
      fx_rate: currency === "EUR" ? "1" : this.rate(),
      source: "manual",
    });
  }

  private yearEndValuations(year: number): void {
    const date = dateOf(year, 12, 31);
    this.valuation("acc_ibkr", "ast_gold", date, this.b.rng.decimal(180, 260, 2), "USD");
    this.valuation("acc_ibkr", "ast_btc", date, this.b.rng.decimal(20, 45, 2), "EUR");
    this.valuation("acc_ibkr2", "ast_gold", date, this.b.rng.decimal(180, 260, 2), "USD");
    for (const asset of ["ast_alpha", "ast_beta", "ast_beta_new", "ast_gamma"]) {
      this.valuation("acc_bucket", asset, date, this.b.rng.decimal(15, 90, 2), "USD");
    }
  }

  private corporateAction(
    kind: CorporateActionEvent["kind"],
    asset_id: AssetId,
    effective_date: CivilDate,
    effects: CorporateActionEvent["effects"],
    notes: string,
  ): void {
    this.b.record<CorporateActionEvent>(effective_date, {
      type: "corporate_action",
      kind,
      asset_id,
      effective_date,
      source_document: `https://issuer.example/${asset_id}/${kind}.pdf`,
      effects,
      notes,
    });
  }

  /** Sells the fractional shares left in each account after scaling `asset` by `ratio`. */
  private picosSale(
    asset_id: AssetId,
    scaled: AssetId,
    ratio: string,
    unit_price: string,
    date: CivilDate,
  ) {
    return {
      op: "forced_sale" as const,
      asset_id: scaled,
      per_account: this.b.picos(asset_id, ratio).map((pico) => ({ ...pico, fee: "0.5" })),
      unit_price,
      currency: "USD",
      fx_rate: this.rate(),
      fx_rate_date: date,
    };
  }

  // --- monthly contribution (ADR-0012 pattern) ---------------------------------

  private contribution(
    asset_id: AssetId,
    amount: string,
    day: CivilDate,
    nav: string,
    fill: boolean,
  ): void {
    const order = this.b.record(day, {
      type: "order_placed",
      account_id: "acc_mi",
      asset_id,
      side: "buy",
      amount,
      requested_date: day,
    });
    if (!fill) {
      return;
    }
    const value = addDays(day, 2);
    this.b.record<BuyEvent>(value, {
      type: "buy",
      account_id: "acc_mi",
      asset_id,
      trade_date: day,
      value_date: value,
      quantity: this.b.unitsFor(amount, nav),
      amount,
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: value,
      fee: "0",
      source: "manual",
      order_id: order.id,
    });
  }

  private fundTransfer(
    from: AssetId,
    to: AssetId,
    share: string,
    requested: CivilDate,
    stages: ("redeemed" | "subscribed")[],
  ): void {
    const quantityOut = units(this.b.position("acc_mi", from).value.mul(d(share)));
    const navOut = this.b.rng.decimal(50, 130, 2);
    const navIn = this.b.rng.decimal(50, 130, 2);
    const request = this.b.record(requested, {
      type: "transfer_requested",
      from_account_id: "acc_mi",
      from_asset_id: from,
      to_account_id: "acc_mi",
      to_asset_id: to,
      quantity_out: quantityOut,
      requested_date: requested,
    });
    const out = addDays(requested, 2);
    const inDate = addDays(requested, 4);
    // Tracking updates are dated on the redemption day: the transfer's business date
    // is value_date_out, and a later-dated update would find the request completed.
    for (const stage of stages) {
      this.b.record(out, {
        type: "transfer_request_updated",
        request_id: request.id,
        stage,
        date: out,
        ...(stage === "redeemed" ? { nav_out: navOut, quantity_out: quantityOut } : {}),
      });
    }
    this.b.record(out, {
      type: "transfer",
      request_id: request.id,
      from_account_id: "acc_mi",
      from_asset_id: from,
      quantity_out: quantityOut,
      nav_out: navOut,
      value_date_out: out,
      to_account_id: "acc_mi",
      to_asset_id: to,
      quantity_in: units(d(quantityOut).mul(d(navOut)).div(d(navIn))),
      nav_in: navIn,
      value_date_in: inDate,
    });
  }

  // --- blocks ------------------------------------------------------------------

  private opening(): void {
    const { p, b } = this;
    const start = "2026-09-01";
    this.catalogue(start);
    const alphaCostEur = d(p.alphaQuantity).mul(d(p.alphaPrice)).div(d(p.fx));
    this.openThesis("th_alpha", "ast_alpha", alphaCostEur, start);
    const yearly = d(p.worldAmount)
      .mul(d("12"))
      .add(d(p.bondsAmount).mul(d("4")));
    this.deposit("acc_mi", START_DEPOSIT_DATE, yearly.add(d(p.mmAmount)).add(d("1000")).toString());
    const goldUsd = d(p.goldTransferred + p.goldKept)
      .mul(d(p.goldPrice))
      .add(d("1.5"));
    const btcEur = d(p.btcQuantity).mul(d(p.btcPrice)).add(d("1"));
    const ibkrFx = ceil(goldUsd.add(d("2")).div(d(p.fx)).div(d("100")).add(d("1")));
    this.deposit("acc_ibkr", start, d(ibkrFx).mul(d("100")).add(btcEur).add(d("100")).toString());
    const bucketUsd = d(p.alphaQuantity)
      .mul(d(p.alphaPrice))
      .add(d(p.betaQuantity).mul(d(p.betaPrice)))
      .add(
        d(p.gammaQuantity + p.gammaSecondQuantity)
          .mul(d(p.gammaPrice))
          .mul(d("1.4")),
      )
      .add(d("10"));
    const bucketFx = ceil(bucketUsd.add(d("2")).div(d(p.fx)).div(d("100")).add(d("1")));
    this.deposit("acc_bucket", start, d(bucketFx).mul(d("100")).add(d("100")).toString());

    const fxDay = "2026-09-02";
    this.fxToUsd("acc_ibkr", fxDay, goldUsd, p.fx);
    this.fxToUsd("acc_bucket", fxDay, bucketUsd, p.fx);

    const tradeDay = "2026-09-03";
    b.record<BuyEvent>(tradeDay, {
      type: "buy",
      account_id: "acc_ibkr",
      asset_id: "ast_gold",
      trade_date: tradeDay,
      value_date: addDays(tradeDay, 2),
      quantity: String(p.goldTransferred + p.goldKept),
      unit_price: p.goldPrice,
      currency: "USD",
      fx_rate: p.fx,
      fx_rate_date: tradeDay,
      fee: "1.5",
      source: "manual",
    });
    b.record<BuyEvent>(tradeDay, {
      type: "buy",
      account_id: "acc_ibkr",
      asset_id: "ast_btc",
      trade_date: tradeDay,
      value_date: addDays(tradeDay, 2),
      quantity: String(p.btcQuantity),
      unit_price: p.btcPrice,
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: tradeDay,
      fee: "1",
      source: "manual",
    });
    const mmValue = addDays(tradeDay, 1);
    b.record<BuyEvent>(mmValue, {
      type: "buy",
      account_id: "acc_mi",
      asset_id: "ast_mm",
      trade_date: tradeDay,
      value_date: mmValue,
      quantity: b.unitsFor(p.mmAmount, b.rng.decimal(99, 101, 2)),
      amount: p.mmAmount,
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: mmValue,
      fee: "0",
      source: "manual",
    });
    this.buyStock(
      "acc_bucket",
      "ast_alpha",
      "2026-09-04",
      p.alphaQuantity,
      p.alphaPrice,
      p.fx,
      "th_alpha",
    );
  }

  private worldNav(): string {
    const nav = this.b.rng.decimal(90, 130, 2);
    if (this.minWorldNav === undefined || d(nav).lt(this.minWorldNav)) {
      this.minWorldNav = d(nav);
    }
    return nav;
  }

  private lossSaleAndLateBuy(trade: CivilDate): void {
    const { b } = this;
    const value = addDays(trade, 2);
    const quantity = units(b.position("acc_mi", "ast_world").value.mul(d("0.3")));
    const lateNav = this.worldNav();
    const price = cents((this.minWorldNav as Decimal).mul(d("0.9")));
    b.record<SellEvent>(value, {
      type: "sell",
      account_id: "acc_mi",
      asset_id: "ast_world",
      trade_date: trade,
      value_date: value,
      quantity,
      unit_price: price,
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: value,
      fee: "0",
      source: "manual",
      notes: "Loss sale followed by monthly contributions within the year",
    });
    // Recorded late, dated before every other lot: the sale above consumes it first (FIFO).
    b.record<BuyEvent>(value, {
      type: "buy",
      account_id: "acc_mi",
      asset_id: "ast_world",
      trade_date: addDays(LATE_BUY_DATE, -2),
      value_date: LATE_BUY_DATE,
      quantity: "2.5",
      unit_price: lateNav,
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: LATE_BUY_DATE,
      fee: "0",
      source: "manual",
      notes: "Found in an old statement; recorded late",
    });
  }

  private custodyTransfer(date: CivilDate): void {
    this.b.record(date, {
      type: "transfer",
      from_account_id: "acc_ibkr",
      from_asset_id: "ast_gold",
      quantity_out: String(this.p.goldTransferred),
      value_date_out: date,
      to_account_id: "acc_ibkr2",
      to_asset_id: "ast_gold",
      quantity_in: String(this.p.goldTransferred),
      value_date_in: date,
      notes: "Custody transfer between the two IBKR accounts",
    });
    this.b.expectWarning("same_asset_two_accounts");
  }

  private reverseSplit(date: CivilDate): void {
    const price = cents(d(this.p.goldPrice).mul(d("4")));
    this.corporateAction(
      "reverse_split",
      "ast_gold",
      date,
      [{ op: "scale", ratio: "1/4" }, this.picosSale("ast_gold", "ast_gold", "1/4", price, date)],
      "1:4 reverse split; fractional shares cashed out account by account",
    );
  }

  private spinOff(date: CivilDate): void {
    this.createAsset(LATER_ASSETS.ast_alpha_spin as AssetSpec, date);
    this.corporateAction(
      "spin_off",
      "ast_alpha",
      date,
      [
        { op: "carve_out", to_asset_id: "ast_alpha_spin", ratio: "1/4", cost_share: "0.2" },
        this.picosSale("ast_alpha", "ast_alpha_spin", "1/4", this.b.rng.decimal(10, 30, 2), date),
      ],
      "Spin-off: one new share per four, 20% of the cost; fractions cashed out",
    );
  }

  private merger(date: CivilDate): void {
    this.createAsset(LATER_ASSETS.ast_beta_new as AssetSpec, date);
    const price = cents(d(this.p.betaPrice).mul(d("3")));
    this.corporateAction(
      "merger",
      "ast_beta",
      date,
      [
        { op: "convert", to_asset_id: "ast_beta_new", ratio: "1/3" },
        this.picosSale("ast_beta", "ast_beta_new", "1/3", price, date),
      ],
      "Absorption: one new share per three old; fractions cashed out",
    );
    this.closeThesis("th_beta", date);
    const invested = d(this.p.betaQuantity).mul(d(this.p.betaPrice)).div(d(this.p.fx));
    this.openThesis("th_beta_new", "ast_beta_new", invested, date);
  }

  private yearEndSale(): void {
    const price = cents(d(this.p.alphaPrice).mul(d("1.3")));
    this.sellStock("ast_alpha", "2027-12-30", "2028-01-02", price, "th_alpha");
    this.closeThesis("th_alpha", "2027-12-30");
  }

  private priorYearCorrection(date: CivilDate): void {
    const wrong = this.wrongDividend as DividendEvent;
    this.b.record(date, {
      type: "reversal",
      reverses_id: wrong.id,
      reason: "withholding_spain typed wrong",
    });
    const { schema_version: _v, id: _id, recorded_at: _at, fingerprint: _fp, ...fields } = wrong;
    this.b.record<DividendEvent>(date, {
      ...fields,
      withholding_spain: pct(wrong.gross, "0.19"),
      corrects_id: wrong.id,
    });
  }

  private delisting(date: CivilDate): void {
    this.corporateAction(
      "delisting",
      "ast_alpha_spin",
      date,
      [],
      "Delisted; position kept without price",
    );
    this.updateAsset(LATER_ASSETS.ast_alpha_spin as AssetSpec, date, false);
  }

  private betaLossSale(date: CivilDate): void {
    const price = cents(d(this.p.betaPrice).mul(d("3")).mul(d("0.7")));
    this.sellStock("ast_beta_new", date, addDays(date, 2), price, "th_beta_new");
    this.closeThesis("th_beta_new", date);
  }

  private fundMerger(date: CivilDate): void {
    this.createAsset(LATER_ASSETS.ast_smallcap_b as AssetSpec, date);
    this.corporateAction(
      "fund_merger",
      "ast_smallcap",
      date,
      [{ op: "convert", to_asset_id: "ast_smallcap_b", ratio: "1.7" }],
      "Fund merger; original acquisition dates and costs kept",
    );
  }

  private shareClassChange(date: CivilDate): void {
    this.createAsset(LATER_ASSETS.ast_bonds_i as AssetSpec, date);
    this.corporateAction(
      "share_class_change",
      "ast_bonds",
      date,
      [{ op: "convert", to_asset_id: "ast_bonds_i", ratio: "1" }],
      "Cheaper share class; same fund",
    );
  }

  private moneyMarketSale(trade: CivilDate): void {
    const value = addDays(trade, 1);
    this.b.record<SellEvent>(value, {
      type: "sell",
      account_id: "acc_mi",
      asset_id: "ast_mm",
      trade_date: trade,
      value_date: value,
      quantity: units(this.b.position("acc_mi", "ast_mm").value.mul(d("0.4"))),
      unit_price: this.b.rng.decimal(100.5, 102, 2),
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: value,
      fee: "0",
      withholding: "1.50",
      source: "manual",
    });
  }

  private withdrawal(date: CivilDate): void {
    this.b.record(date, {
      type: "cash_withdrawal",
      account_id: "acc_mi",
      value_date: date,
      amount: "200",
      currency: "EUR",
      fx_rate: "1",
      notes: "Cash moved back to the bank",
    });
  }

  private identifierChange(date: CivilDate): void {
    this.updateAsset({ ...(ASSETS[0] as AssetSpec), isin: "XX0000000011" }, date, true);
  }

  private pendingRequest(date: CivilDate): void {
    this.b.record(date, {
      type: "transfer_requested",
      from_account_id: "acc_mi",
      from_asset_id: "ast_world",
      to_account_id: "acc_mi",
      to_asset_id: "ast_smallcap_b",
      quantity_out: units(this.b.position("acc_mi", "ast_world").value.mul(d("0.1"))),
      requested_date: date,
      notes: "Still in transit at the end of the ledger",
    });
  }

  // --- the timeline --------------------------------------------------------------

  run(): LedgerEvent[] {
    const { p, b } = this;
    this.opening();
    for (let m = 0; m < MONTHS; m += 1) {
      const { year, month } = monthAt(m);
      const day = dateOf(year, month, b.day());
      const block = addDays(day, 3);

      if (m === 10) {
        const cancelled = b.record(day, {
          type: "order_placed",
          account_id: "acc_mi",
          asset_id: "ast_world",
          side: "buy",
          amount: p.worldAmount,
          requested_date: day,
        });
        b.record(addDays(day, 1), {
          type: "order_updated",
          order_id: cancelled.id,
          stage: "cancelled",
          date: addDays(day, 1),
          notes: "Cancelled: the platform was in maintenance",
        });
      } else {
        this.contribution("ast_world", p.worldAmount, day, this.worldNav(), m !== MONTHS - 1);
      }
      if (m % 3 === 0) {
        const bonds = m >= 19 ? "ast_bonds_i" : "ast_bonds";
        this.contribution(bonds, p.bondsAmount, addDays(day, 1), b.rng.decimal(95, 110, 2), true);
      }

      switch (m) {
        case 1:
          this.openThesis(
            "th_beta",
            "ast_beta",
            d(p.betaQuantity).mul(d(p.betaPrice)).div(d(p.fx)),
            block,
          );
          this.buyStock(
            "acc_bucket",
            "ast_beta",
            block,
            p.betaQuantity,
            p.betaPrice,
            this.rate(),
            "th_beta",
          );
          this.interest(dateOf(year, month, 28));
          break;
        case 2:
          this.dividendAlpha(addDays(block, 7), "0.19");
          break;
        case 3:
          this.fee(dateOf(year, month, 15), "Custody fee");
          this.yearEndValuations(year);
          break;
        case 4:
          // Before the first fund transfer, so that the sale (not the transfer) consumes the late buy.
          this.lossSaleAndLateBuy(block);
          break;
        case 6:
          this.fundTransfer("ast_world", "ast_smallcap", "0.4", block, ["redeemed"]);
          break;
        case 7:
          this.wrongDividend = this.dividendAlpha(addDays(block, 7), "0");
          break;
        case 8:
          this.custodyTransfer(block);
          break;
        case 9:
          this.reverseSplit(block);
          break;
        case 10:
          this.openThesis(
            "th_gamma",
            "ast_gamma",
            d(p.gammaQuantity + p.gammaSecondQuantity)
              .mul(d(p.gammaPrice))
              .mul(d("1.4"))
              .div(d(p.fx)),
            block,
          );
          this.buyStock(
            "acc_bucket",
            "ast_gamma",
            block,
            p.gammaQuantity,
            p.gammaPrice,
            this.rate(),
            "th_gamma",
          );
          break;
        case 11:
          this.fundTransfer("ast_smallcap", "ast_bonds", "0.5", block, ["redeemed", "subscribed"]);
          break;
        case 12:
          b.record(day, {
            type: "settings_changed",
            settings: settingsWith(
              { equity: "55", fixed_income: "30", gold: "10", crypto: "5" },
              p.worldAmount,
            ),
          });
          this.deposit(
            "acc_mi",
            day,
            d(p.worldAmount)
              .mul(d("12"))
              .add(d(p.bondsAmount).mul(d("4")))
              .add(d("500"))
              .toString(),
          );
          this.identifierChange(block);
          break;
        case 13:
          this.spinOff(block);
          break;
        case 14:
          this.corporateAction(
            "split",
            "ast_gamma",
            block,
            [{ op: "scale", ratio: "2" }],
            "2:1 split",
          );
          this.merger(addDays(block, 1));
          break;
        case 15:
          this.yearEndSale();
          this.yearEndValuations(year);
          break;
        case 16:
          this.priorYearCorrection(block);
          this.delisting(addDays(block, 1));
          this.betaLossSale(addDays(block, 2));
          break;
        case 17:
          this.fundMerger(block);
          break;
        case 18:
          this.shareClassChange(block);
          break;
        case 19:
          this.interest(dateOf(year, month, 28));
          this.withdrawal(block);
          break;
        case 20:
          this.moneyMarketSale(block);
          break;
        case 21:
          this.fee(dateOf(year, month, 15), "Market data fee");
          break;
        case 24:
          this.deposit(
            "acc_mi",
            day,
            d(p.worldAmount)
              .mul(d("12"))
              .add(d(p.bondsAmount).mul(d("4")))
              .add(d("500"))
              .toString(),
          );
          this.buyStock(
            "acc_bucket",
            "ast_gamma",
            block,
            p.gammaSecondQuantity,
            cents(d(p.gammaPrice).mul(d("1.2"))),
            this.rate(),
            "th_gamma",
          );
          break;
        case 26:
          this.pendingRequest(block);
          break;
        case 27:
          this.yearEndValuations(year);
          break;
        default:
          break;
      }
    }
    return b.events;
  }
}

/** Deterministic synthetic ledger: same seed, same bytes. */
export const generateLedger = ({ seed }: GenerateOptions): LedgerEvent[] =>
  new Scenario(seed).run();
