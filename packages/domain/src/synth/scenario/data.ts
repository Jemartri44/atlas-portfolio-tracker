// The fixed parts of the synthetic scenario: the accounts, assets and settings of each stage, the
// parameters the seed draws once before any event is recorded, and the small helpers that compute
// amounts as decimal text.

import { Decimal } from "../../money/decimal.js";
import type { AssetCreatedEvent, Draft } from "../../schema/events.js";
import type { Settings } from "../../settings/settings.js";
import type { Prng } from "../random.js";
export const MONTHS = 28; // 2026-09 … 2028-12
export const START_DEPOSIT_DATE = "2026-08-25";
export const LATE_BUY_DATE = "2026-08-28";

export const d = (text: string | number): Decimal => Decimal.parse(String(text));
export const mul = (a: string, b: string): string => d(a).mul(d(b)).toString();
export const pct = (amount: string, rate: string): string =>
  d(amount).mul(d(rate)).round(2).toString();
export const cents = (value: Decimal): string => value.round(2).toString();
export const units = (value: Decimal): string => value.round(4).toString();
/** Smallest integer not below `value`, as a string (positive values). */
export const ceil = (value: Decimal): string => {
  const rounded = value.round(0);
  return (rounded.lt(value) ? rounded.add(Decimal.ONE) : rounded).toString();
};

/** Every seed-dependent parameter, drawn once in a fixed order before any event is recorded. */
export interface Params {
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

/** ≥ 5 so that, after the 1:4 reverse split, both IBKR accounts keep a whole share to value at 31/12. */
export const NOT_MULTIPLE_OF_FOUR = [5, 6, 7];
export const NOT_MULTIPLE_OF_FOUR_LOTS = [10, 11, 13, 14, 15, 17, 18, 19];
export const NOT_MULTIPLE_OF_THREE = [10, 11, 13, 14, 16, 17, 19, 20];

export const drawParams = (rng: Prng): Params => ({
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

export const ACCOUNTS = [
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

export type AssetSpec = Omit<Draft<AssetCreatedEvent>, "type" | "active">;

export const ASSETS: readonly AssetSpec[] = [
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

/** Bucket assets of the phase-3 programme: in euros, so the block adds no currency noise. */
export const BUCKET_PROGRAMME_ASSETS: readonly AssetSpec[] = [
  {
    asset_id: "ast_delta",
    asset_type: "stock",
    book: "bucket",
    ticker: "DEL",
    name: "Delta Materials",
    currency: "EUR",
    transferable: false,
  },
  {
    asset_id: "ast_epsilon",
    asset_type: "stock",
    book: "bucket",
    ticker: "EPS",
    name: "Epsilon Logistics",
    currency: "EUR",
    transferable: false,
  },
];

export const LATER_ASSETS: Record<string, AssetSpec> = {
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

/** Target weights by `asset_id` over the core book; they add up to exactly 100. */
export const TARGET_WEIGHTS: Record<string, string> = {
  ast_world: "45",
  ast_smallcap: "10",
  ast_bonds: "20",
  ast_mm: "10",
  ast_gold: "10",
  ast_btc: "5",
};

/** The later plan of the scenario: less equity, more fixed income (a second `settings_changed`). */
export const TARGET_WEIGHTS_LATER: Record<string, string> = {
  ast_world: "40",
  ast_smallcap: "10",
  ast_bonds: "22",
  ast_mm: "13",
  ast_gold: "10",
  ast_btc: "5",
};

/**
 * The plan after the fund merger and the share-class change: the same weights
 * moved onto the surviving assets. Without this the plan would keep naming
 * funds that no longer exist and the contribution would propose buying them.
 */
export const TARGET_WEIGHTS_AFTER_CONVERSIONS: Record<string, string> = {
  ast_world: "40",
  ast_smallcap_b: "10",
  ast_bonds_i: "22",
  ast_mm: "13",
  ast_gold: "10",
  ast_btc: "5",
};

/**
 * The scenario writes its own per-asset-type maps instead of inheriting
 * `DEFAULT_SETTINGS`, and on purpose: the defaults grow with the enum (a new
 * type such as `etf` shows up), and inheriting them would rewrite three
 * `settings_changed` lines of the golden file every time a type is added. As a
 * bonus, the synthetic ledger is now what a ledger written before `etf` existed
 * looks like, which is the regression test of the partial maps of ADR-0018.
 */
export const SCENARIO_FISCAL_DATE_RULE: Settings["fiscal_date_rule"] = {
  stock: "trade_date",
  etc: "trade_date",
  etp: "trade_date",
  crypto: "trade_date",
  fund: "value_date",
  money_market: "value_date",
};

/**
 * The window the synthetic scenario writes down, **on purpose a second table
 * and not the documented default**.
 *
 * It looks like duplication and it is not. The golden file is **frozen once
 * merged**, and a generator that read
 * `DEFAULT_WASH_SALE_WINDOW` would rewrite it every time the code changed its
 * mind about a criterion: moving the fund from a year to two months
 * (criterion #2, 2026-09-22) would have rewritten the settings line of a file
 * whose whole purpose is not to move. The scenario is **data**, and data says
 * what it says; the default is **what the code believes today**. A fixture
 * that follows the code proves nothing about the code.
 *
 * What that costs is drift, and drift is what a test is for:
 * `test/synth/generator.test.ts` checks that this table names **every asset
 * type except `etf`**, so a type added to the enum cannot ride a default here
 * without somebody noticing. `etf` is left out deliberately, and always was:
 * the golden relies on it falling back, which is what makes the report list it
 * in `settings.from_code`.
 */
export const SCENARIO_WASH_SALE_WINDOW: Settings["wash_sale_window"] = {
  stock: "2m",
  etc: "2m",
  etp: "2m",
  crypto: "1y",
  fund: "1y",
  money_market: "1y",
};

export const settingsWith = (weights: Record<string, string>, contribution: string): Settings => ({
  fiscal_date_rule: SCENARIO_FISCAL_DATE_RULE,
  wash_sale_window: SCENARIO_WASH_SALE_WINDOW,
  target_weights: weights,
  deviation_threshold_pp: "5",
  satellite_min_weight_pct: "2",
  monthly_contribution_eur: contribution,
  bucket_pct_of_contribution: "10",
  bucket_max_cumulative_contribution: "6000",
  bucket_stop_loss_pct: "30",
  bucket_max_weight_pct: "10",
  bucket_benchmark_asset_id: "ast_world",
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
