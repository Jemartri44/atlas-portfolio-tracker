// The ledger of the hand-computed exercise (specs/009-tax-engine/questions.md,
// "Ejercicio calculado a mano"). Event by event as the table there lists them:
// E1 … E25. The expected figures live in `exercise.test.ts`, written from the
// hand calculation and not from the engine.

import type { LedgerEvent } from "../../src/schema/events.js";
import {
  DEFAULT_INCOME_CATEGORY,
  DEFAULT_SETTINGS,
  type IncomeCategory,
} from "../../src/settings/settings.js";
import { LedgerBuilder } from "../ledger-builder.js";

export type Label = `E${number}`;

export interface Exercise {
  events: LedgerEvent[];
  /** Event id of each label of the table. */
  id: Record<string, string>;
  settingsId: string;
}

/**
 * Which reading of criterion #24 the ledger writes down for an ETC and an ETP.
 * `"from_code"` leaves `income_category` out of the `settings_changed`, so the
 * documented default applies at reading time.
 */
export type CategoryReading = IncomeCategory | "from_code";

/**
 * The hand calculation of feature 009 says, in so many words, "everything a
 * capital gain", so the ledger writes it down instead of borrowing whatever
 * the code says today: the default of an ETC changed in feature 010 (criterion
 * #24) and the literals of `exercise.test.ts` have to keep meaning what they
 * were computed to mean (note N17). The same document also works the exercise
 * out with the ETC as movable capital income, and that reading has its own
 * test.
 */
export const exerciseLedger = (reading: CategoryReading = "capital_gain"): Exercise => {
  const b = new LedgerBuilder();
  const id: Record<string, string> = {};
  // `exactOptionalPropertyTypes`: the key is left out, not set to `undefined`.
  const { income_category: _fromCode, ...withoutCategory } = DEFAULT_SETTINGS;
  const settings = b.settings({
    ...withoutCategory,
    ...(reading === "from_code"
      ? {}
      : { income_category: { ...DEFAULT_INCOME_CATEGORY, etc: reading, etp: reading } }),
    wash_sale_transfer_counts: true,
    savings_offset_limit_pct: "25",
    loss_carryforward_years: 4,
    treaty_withholding_pct: { US: "15" },
  });
  b.account("acc_mi", { platform: "myinvestor", country: "ES" });
  b.account("acc_ibkr", { platform: "ibkr", country: "IE" });
  b.account("acc_bkt", { platform: "ibkr", country: "IE", book: "bucket" });
  b.asset("fund_a");
  b.asset("fund_b");
  b.asset("etc_gold", {
    asset_type: "etc",
    asset_class: "gold",
    transferable: false,
    market: "XETR",
  });
  const bucket = { book: "bucket", transferable: false } as const;
  b.asset("stock_us", { ...bucket, asset_type: "stock", currency: "USD", market: "XNAS" });
  b.asset("stock_eu", { ...bucket, asset_type: "stock" });
  b.asset("coin_x", { ...bucket, asset_type: "crypto" });
  b.asset("coin_y", { ...bucket, asset_type: "crypto" });
  for (const [thesis, asset] of [
    ["th_us", "stock_us"],
    ["th_eu", "stock_eu"],
    ["th_x", "coin_x"],
    ["th_y", "coin_y"],
  ] as const) {
    b.thesisOpened({ thesis_id: thesis, account_id: "acc_bkt", asset_id: asset });
  }
  const usd = { currency: "USD", fee: "1" } as const;

  id.E1 = b.buy({
    account_id: "acc_mi",
    asset_id: "fund_a",
    value_date: "2027-02-01",
    quantity: "100",
    amount: "1000",
    unit_price: "10",
  }).id;
  id.E2 = b.buy({
    account_id: "acc_bkt",
    asset_id: "stock_us",
    value_date: "2027-03-01",
    quantity: "10",
    amount: "1000",
    ...usd,
    fx_rate: "1.10",
    thesis_id: "th_us",
  }).id;
  id.E3 = b.buy({
    account_id: "acc_ibkr",
    asset_id: "etc_gold",
    value_date: "2027-05-03",
    quantity: "10",
    unit_price: "70",
  }).id;
  id.E4 = b.buy({
    account_id: "acc_bkt",
    asset_id: "stock_eu",
    value_date: "2027-06-01",
    quantity: "10",
    unit_price: "20",
    thesis_id: "th_eu",
  }).id;
  id.E5 = b.sell({
    account_id: "acc_bkt",
    asset_id: "stock_us",
    value_date: "2027-09-01",
    quantity: "10",
    amount: "800",
    unit_price: "80",
    ...usd,
    fx_rate: "1.25",
    thesis_id: "th_us",
  }).id;
  id.E6 = b.interest({
    account_id: "acc_mi",
    value_date: "2027-10-01",
    fx_rate_date: "2027-10-01",
    gross: "40",
    withholding_spain: "7.60",
  }).id;
  id.E7 = b.buy({
    account_id: "acc_ibkr",
    asset_id: "etc_gold",
    value_date: "2028-01-10",
    quantity: "5",
    unit_price: "50",
  }).id;
  id.E8 = b.fx({
    account_id: "acc_bkt",
    value_date: "2028-01-31",
    sold_amount: "1000",
    sold_currency: "EUR",
    bought_amount: "1100",
    bought_currency: "USD",
    fee: "0",
    fee_currency: "EUR",
    fx_rate_sold: "1",
    fx_rate_bought: "1.10",
    fx_rate_date: "2028-01-31",
  }).id;
  id.E9 = b.buy({
    account_id: "acc_bkt",
    asset_id: "stock_us",
    value_date: "2028-02-01",
    quantity: "10",
    amount: "1000",
    ...usd,
    fx_rate: "1.10",
    thesis_id: "th_us",
  }).id;
  id.E10 = b.buy({
    account_id: "acc_bkt",
    asset_id: "coin_x",
    value_date: "2028-02-10",
    quantity: "1",
    unit_price: "1000",
    thesis_id: "th_x",
  }).id;
  id.E11 = b.sell({
    account_id: "acc_mi",
    asset_id: "fund_a",
    value_date: "2028-03-01",
    quantity: "40",
    amount: "320",
    unit_price: "8",
  }).id;
  id.E12 = b.sell({
    account_id: "acc_ibkr",
    asset_id: "etc_gold",
    value_date: "2028-03-10",
    quantity: "10",
    unit_price: "55",
  }).id;
  id.E13 = b.corporateAction({
    kind: "reverse_split",
    asset_id: "stock_eu",
    effective_date: "2028-05-02",
    effects: [
      { op: "scale", ratio: "1/4" },
      {
        op: "forced_sale",
        per_account: [{ account_id: "acc_bkt", quantity: "0.5" }],
        unit_price: "90",
        currency: "EUR",
        fx_rate: "1",
        fx_rate_date: "2028-05-02",
      },
    ],
  }).id;
  id.E14 = b.buy({
    account_id: "acc_ibkr",
    asset_id: "etc_gold",
    value_date: "2028-05-11",
    quantity: "5",
    unit_price: "52",
  }).id;
  id.E15 = b.buy({
    account_id: "acc_mi",
    asset_id: "fund_a",
    value_date: "2028-06-01",
    quantity: "20",
    amount: "180",
    unit_price: "9",
  }).id;
  id.E16 = b.dividend({
    account_id: "acc_bkt",
    asset_id: "stock_us",
    value_date: "2028-06-15",
    fx_rate_date: "2028-06-15",
    gross: "20",
    withholding_origin: "6",
    withholding_spain: "0",
    currency: "USD",
    fx_rate: "1.25",
    source_country: "US",
    per_unit: "2",
  }).id;
  id.E17 = b.swap({
    account_id: "acc_bkt",
    from_asset_id: "coin_x",
    to_asset_id: "coin_y",
    value_date: "2028-07-03",
    quantity_out: "1",
    market_value_out: "1200",
    quantity_in: "10",
    market_value_in: "1190",
    fee: "10",
    thesis_id: "th_y",
  }).id;
  id.E18 = b.transfer({
    from_account_id: "acc_mi",
    from_asset_id: "fund_a",
    quantity_out: "80",
    nav_out: "12",
    value_date_out: "2028-09-01",
    to_account_id: "acc_mi",
    to_asset_id: "fund_b",
    quantity_in: "160",
    nav_in: "6",
    value_date_in: "2028-09-01",
  }).id;
  id.E19 = b.sell({
    account_id: "acc_ibkr",
    asset_id: "etc_gold",
    value_date: "2028-11-02",
    quantity: "5",
    unit_price: "60",
  }).id;
  id.E20 = b.sell({
    account_id: "acc_mi",
    asset_id: "fund_b",
    value_date: "2028-11-15",
    quantity: "150",
    amount: "900",
    unit_price: "6",
    withholding: "31.35",
  }).id;
  id.E21 = b.sell({
    account_id: "acc_bkt",
    asset_id: "stock_us",
    value_date: "2028-12-01",
    quantity: "10",
    amount: "1300",
    unit_price: "130",
    ...usd,
    fx_rate: "1.20",
    thesis_id: "th_us",
  }).id;
  id.E22 = b.buy({
    account_id: "acc_ibkr",
    asset_id: "etc_gold",
    value_date: "2028-12-15",
    quantity: "2",
    unit_price: "62",
  }).id;
  id.E23 = b.interest({
    account_id: "acc_mi",
    value_date: "2028-12-29",
    fx_rate_date: "2028-12-29",
    gross: "60",
    withholding_spain: "11.40",
  }).id;
  id.E24 = b.fee({
    account_id: "acc_ibkr",
    value_date: "2028-12-29",
    amount: "12",
    description: "custodia",
    fee_kind: "custody",
  }).id;
  for (const [account, asset, quantity, value] of [
    ["acc_mi", "fund_b", "10", "6"],
    ["acc_ibkr", "etc_gold", "7", "61"],
    ["acc_bkt", "stock_eu", "2", "95"],
    ["acc_bkt", "coin_y", "10", "130"],
  ] as const) {
    b.valuation({
      account_id: account,
      asset_id: asset,
      date: "2028-12-29",
      quantity,
      unit_value: value,
    });
  }
  return { events: b.build(), id, settingsId: settings.id };
};
