// The building blocks of the scenario: what one record of each kind looks like (catalogue,
// cash, trades, theses, valuations, corporate actions, the monthly contribution and the transfer
// between funds). The blocks and the timeline compose them.

import { type CivilDate, lastWorkingDay } from "../../dates/civil-date.js";
import type { Decimal } from "../../money/decimal.js";
import type {
  AccountId,
  AssetCreatedEvent,
  AssetId,
  AssetUpdatedEvent,
  BuyEvent,
  CorporateActionEvent,
  DividendEvent,
  SellEvent,
  ValuationEvent,
} from "../../schema/events.js";
import { addDays, dateOf } from "../calendar.js";
import type { ScenarioContext } from "./context.js";
import {
  ACCOUNTS,
  ASSETS,
  type AssetSpec,
  ceil,
  cents,
  d,
  mul,
  pct,
  settingsWith,
  TARGET_WEIGHTS,
  units,
} from "./data.js";

export const rate = (c: ScenarioContext): string => {
  return c.b.rng.decimal(1.05, 1.15, 4);
};

export const createAsset = (c: ScenarioContext, spec: AssetSpec, date: CivilDate): void => {
  c.b.record<AssetCreatedEvent>(date, { type: "asset_created", ...spec, active: true });
};

export const updateAsset = (
  c: ScenarioContext,
  spec: AssetSpec,
  date: CivilDate,
  active: boolean,
): void => {
  c.b.record<AssetUpdatedEvent>(date, { type: "asset_updated", ...spec, active });
};

export const catalogue = (c: ScenarioContext, date: CivilDate): void => {
  c.b.record(date, {
    type: "settings_changed",
    settings: settingsWith(TARGET_WEIGHTS, c.p.worldAmount),
  });
  for (const account of ACCOUNTS) {
    c.b.record(date, {
      type: "account_created",
      ...account,
      base_currency: "EUR",
      active: true,
    });
  }
  for (const asset of ASSETS) {
    createAsset(c, asset, date);
  }
};

export const deposit = (
  c: ScenarioContext,
  account_id: AccountId,
  date: CivilDate,
  amount: string,
): void => {
  c.b.record(date, {
    type: "cash_deposit",
    account_id,
    value_date: date,
    amount,
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: lastWorkingDay(date),
  });
};

/** Sells `sold` EUR for USD at `rate`; the USD bought cover at least `needUsd` after the fee. */
export const fxToUsd = (
  c: ScenarioContext,
  account_id: AccountId,
  date: CivilDate,
  needUsd: Decimal,
  rate: string,
): string => {
  const sold = ceil(needUsd.add(d("2")).div(d(rate)).div(d("100")).add(d("1")));
  const soldAmount = d(sold).mul(d("100")).toString();
  c.b.record(date, {
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
    fx_rate_date: lastWorkingDay(date),
  });
  return soldAmount;
};

export const buyStock = (
  c: ScenarioContext,
  account_id: AccountId,
  asset_id: AssetId,
  trade: CivilDate,
  quantity: number,
  unit_price: string,
  fx_rate: string,
  thesis_id: string,
): BuyEvent => {
  return c.b.record<BuyEvent>(trade, {
    type: "buy",
    account_id,
    asset_id,
    trade_date: trade,
    value_date: addDays(trade, 2),
    quantity: String(quantity),
    unit_price,
    currency: "USD",
    fx_rate,
    fx_rate_date: lastWorkingDay(trade),
    fee: "1",
    source: "manual",
    thesis_id,
  });
};

export const sellStock = (
  c: ScenarioContext,
  asset_id: AssetId,
  trade: CivilDate,
  value: CivilDate,
  unit_price: string,
  thesis_id: string,
): SellEvent => {
  return c.b.record<SellEvent>(trade, {
    type: "sell",
    account_id: "acc_bucket",
    asset_id,
    trade_date: trade,
    value_date: value,
    quantity: c.b.position("acc_bucket", asset_id).toString(),
    unit_price,
    currency: "USD",
    fx_rate: rate(c),
    fx_rate_date: lastWorkingDay(trade),
    fee: "1",
    source: "manual",
    thesis_id,
  });
};

export const openThesis = (
  c: ScenarioContext,
  thesis_id: string,
  asset_id: AssetId,
  plannedEur: Decimal,
  date: CivilDate,
): void => {
  c.b.record(date, {
    type: "thesis_opened",
    thesis_id,
    account_id: "acc_bucket",
    asset_id,
    hypothesis: `Synthetic thesis on ${asset_id}`,
    expected_horizon_days: 180,
    invalidation: "Synthetic invalidation rule",
    planned_size_eur: ceil(plannedEur.mul(d("1.3"))),
  });
};

export const closeThesis = (c: ScenarioContext, thesis_id: string, date: CivilDate): void => {
  c.b.record(date, { type: "thesis_closed", thesis_id, closing_notes: `${thesis_id} closed` });
};

export const dividendAlpha = (
  c: ScenarioContext,
  date: CivilDate,
  withholdingSpainRate: string,
): DividendEvent => {
  const gross = cents(d(c.p.alphaQuantity).mul(d("0.20")));
  return c.b.record<DividendEvent>(date, {
    type: "dividend",
    account_id: "acc_bucket",
    asset_id: "ast_alpha",
    value_date: date,
    gross,
    withholding_origin: pct(gross, "0.15"),
    withholding_spain: pct(gross, withholdingSpainRate),
    currency: "USD",
    fx_rate: rate(c),
    fx_rate_date: lastWorkingDay(date),
    source_country: "US",
    per_unit: "0.20",
  });
};

export const interest = (c: ScenarioContext, date: CivilDate): void => {
  const gross = c.b.rng.decimal(5, 20, 2);
  c.b.record(date, {
    type: "interest",
    account_id: "acc_mi",
    value_date: date,
    gross,
    withholding_spain: pct(gross, "0.19"),
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: lastWorkingDay(date),
  });
};

export const fee = (c: ScenarioContext, date: CivilDate, description: string): void => {
  c.b.record(date, {
    type: "standalone_fee",
    account_id: "acc_ibkr",
    value_date: date,
    amount: "3",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: lastWorkingDay(date),
    description,
  });
};

export const valuation = (
  c: ScenarioContext,
  account_id: AccountId,
  asset_id: AssetId,
  date: CivilDate,
  unit_value: string,
  currency: string,
): void => {
  const quantity = c.b.position(account_id, asset_id);
  if (quantity.isZero()) {
    return;
  }
  c.b.record<ValuationEvent>(date, {
    type: "valuation",
    account_id,
    asset_id,
    date,
    quantity: quantity.toString(),
    unit_value,
    currency,
    fx_rate: currency === "EUR" ? "1" : rate(c),
    // The ECB rate has a publication date of its own (ADR-0013), and since
    // ADR-0021 it is required whatever the currency. Five of the scenario's
    // valuations fall on 31/12/2028, which is a **Sunday**: the rate that
    // applies is Friday 2028-12-29's, which is the very case that made this
    // field necessary.
    fx_rate_date: lastWorkingDay(date),
    source: "manual",
  });
};

export const yearEndValuations = (c: ScenarioContext, year: number): void => {
  const date = dateOf(year, 12, 31);
  valuation(c, "acc_ibkr", "ast_gold", date, c.b.rng.decimal(180, 260, 2), "USD");
  valuation(c, "acc_ibkr", "ast_btc", date, c.b.rng.decimal(20, 45, 2), "EUR");
  valuation(c, "acc_ibkr2", "ast_gold", date, c.b.rng.decimal(180, 260, 2), "USD");
  // The core funds too: without a price for every core asset held, `weights` is
  // partial and `contribute` refuses to split.
  for (const asset of ["ast_world", "ast_smallcap", "ast_smallcap_b", "ast_bonds", "ast_bonds_i"]) {
    valuation(c, "acc_mi", asset, date, c.b.rng.decimal(80, 130, 2), "EUR");
  }
  valuation(c, "acc_mi", "ast_mm", date, c.b.rng.decimal(100, 108, 2), "EUR");
  for (const asset of ["ast_alpha", "ast_beta", "ast_beta_new", "ast_gamma"]) {
    valuation(c, "acc_bucket", asset, date, c.b.rng.decimal(15, 90, 2), "USD");
  }
};

export const corporateAction = (
  c: ScenarioContext,
  kind: CorporateActionEvent["kind"],
  asset_id: AssetId,
  effective_date: CivilDate,
  effects: CorporateActionEvent["effects"],
  notes: string,
): void => {
  c.b.record<CorporateActionEvent>(effective_date, {
    type: "corporate_action",
    kind,
    asset_id,
    effective_date,
    source_document: `https://issuer.example/${asset_id}/${kind}.pdf`,
    effects,
    notes,
  });
};

/** Sells the fractional shares left in each account after scaling `asset` by `ratio`. */
export const picosSale = (
  c: ScenarioContext,
  asset_id: AssetId,
  scaled: AssetId,
  ratio: string,
  unit_price: string,
  date: CivilDate,
) => {
  return {
    op: "forced_sale" as const,
    asset_id: scaled,
    per_account: c.b.picos(asset_id, ratio).map((pico) => ({ ...pico, fee: "0.5" })),
    unit_price,
    currency: "USD",
    fx_rate: rate(c),
    fx_rate_date: lastWorkingDay(date),
  };
};

export const contribution = (
  c: ScenarioContext,
  asset_id: AssetId,
  amount: string,
  day: CivilDate,
  nav: string,
  fill: boolean,
): void => {
  const order = c.b.record(day, {
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
  c.b.record<BuyEvent>(value, {
    type: "buy",
    account_id: "acc_mi",
    asset_id,
    trade_date: day,
    value_date: value,
    quantity: c.b.unitsFor(amount, nav),
    amount,
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: lastWorkingDay(value),
    fee: "0",
    source: "manual",
    order_id: order.id,
  });
};

export const fundTransfer = (
  c: ScenarioContext,
  from: AssetId,
  to: AssetId,
  share: string,
  requested: CivilDate,
  stages: ("redeemed" | "subscribed")[],
): void => {
  const quantityOut = units(c.b.position("acc_mi", from).value.mul(d(share)));
  const navOut = c.b.rng.decimal(50, 130, 2);
  const navIn = c.b.rng.decimal(50, 130, 2);
  const request = c.b.record(requested, {
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
    c.b.record(out, {
      type: "transfer_request_updated",
      request_id: request.id,
      stage,
      date: out,
      ...(stage === "redeemed" ? { nav_out: navOut, quantity_out: quantityOut } : {}),
    });
  }
  c.b.record(out, {
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
};
