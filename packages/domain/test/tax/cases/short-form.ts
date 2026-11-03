// The short form the hand-computed cases of the third audit were written in
// (a terse description of an event, amounts as strings), and the ledger it
// becomes. The cases are synthetic: invented ISINs, round amounts, made-up
// ECB rates.

import type { LedgerEvent } from "../../../src/schema/events.js";
import { fingerprintOf } from "../../../src/schema/fingerprint.js";
import type { Settings } from "../../../src/settings/settings.js";
import { LedgerBuilder } from "../../ledger-builder.js";

/** The day the cases were worked out; it decides what is still provisional. */
export const TODAY = "2026-11-03";

/**
 * Every value the engine reads, written out: nothing here rides a default.
 * The window of a fund and of a money-market fund is **two months**, the
 * default in force when the cases were calculated by hand.
 */
export const CASE_SETTINGS: Settings = {
  fiscal_date_rule: {
    stock: "trade_date",
    etf: "trade_date",
    etc: "trade_date",
    etp: "trade_date",
    crypto: "trade_date",
    fund: "value_date",
    money_market: "value_date",
  },
  wash_sale_window: {
    stock: "2m",
    etf: "2m",
    etc: "2m",
    etp: "2m",
    crypto: "1y",
    fund: "2m",
    money_market: "2m",
  },
  income_category: {
    stock: "capital_gain",
    etf: "capital_gain",
    etc: "movable_capital",
    etp: "movable_capital",
    crypto: "capital_gain",
    fund: "capital_gain",
    money_market: "capital_gain",
  },
  wash_sale_transfer_counts: true,
  fx_gain_method: "currency_first",
  savings_offset_limit_pct: "25",
  loss_carryforward_years: 4,
  treaty_withholding_pct: { US: "15" },
};

type Raw = Record<string, unknown>;
interface Opts {
  cur?: string;
  fx?: string;
  fxd?: string;
  vd?: string;
  fee?: string;
  kind?: string;
  withholding?: string;
  thesis?: string;
  amount?: string;
  origin?: string;
  spain?: string;
  country?: string;
}

const fxOf = (o: Opts, date: string): Raw => ({
  currency: o.cur ?? "EUR",
  fx_rate: o.fx ?? "1",
  fx_rate_date: o.fxd ?? date,
});

export const acc = (account_id: string, platform: string, country: string, book = "core"): Raw => ({
  type: "account_created",
  account_id,
  name: account_id,
  platform,
  book,
  country,
  active: true,
  base_currency: "EUR",
});

export const asset = (
  asset_id: string,
  asset_type: string,
  o: {
    book?: string;
    cls?: string;
    isin?: string;
    cur?: string;
    transferable?: boolean;
    market?: string;
    issuer_country?: string;
  } = {},
): Raw => ({
  type: "asset_created",
  asset_id,
  asset_type,
  book: o.book ?? "core",
  ...(o.book === "bucket" ? {} : { asset_class: o.cls ?? "equity" }),
  isin: o.isin,
  name: asset_id,
  currency: o.cur ?? "EUR",
  active: true,
  transferable: o.transferable ?? false,
  ...(o.market ? { market: o.market } : {}),
  ...(o.issuer_country ? { issuer_country: o.issuer_country } : {}),
});

const trade =
  (type: "buy" | "sell") =>
  (
    account_id: string,
    asset_id: string,
    trade_date: string,
    quantity: string,
    unit_price: string,
    o: Opts = {},
  ): Raw => {
    const value_date = o.vd ?? trade_date;
    return {
      type,
      account_id,
      asset_id,
      trade_date,
      value_date,
      quantity,
      unit_price,
      ...fxOf(o, o.fxd ?? (o.kind === "fund" ? value_date : trade_date)),
      fee: o.fee ?? "0",
      source: "manual",
      ...(o.withholding ? { withholding: o.withholding } : {}),
      ...(o.thesis ? { thesis_id: o.thesis } : {}),
    };
  };
export const buy = trade("buy");
export const sell = trade("sell");

export const deposit = (account_id: string, value_date: string, amount: string): Raw => ({
  type: "cash_deposit",
  account_id,
  value_date,
  amount,
  ...fxOf({}, value_date),
});

export const fx = (
  account_id: string,
  value_date: string,
  sold_amount: string,
  sold_currency: string,
  fx_rate_sold: string,
  bought_amount: string,
  bought_currency: string,
  fx_rate_bought: string,
): Raw => ({
  type: "fx_exchange",
  account_id,
  value_date,
  sold_amount,
  sold_currency,
  bought_amount,
  bought_currency,
  fee: "0",
  fee_currency: sold_currency,
  fx_rate_sold,
  fx_rate_bought,
  fx_rate_date: value_date,
});

export const dividend = (
  account_id: string,
  asset_id: string,
  value_date: string,
  gross: string,
  o: Opts = {},
): Raw => ({
  type: "dividend",
  account_id,
  asset_id,
  value_date,
  gross,
  withholding_origin: o.origin ?? "0",
  withholding_spain: o.spain ?? "0",
  ...fxOf(o, value_date),
  ...(o.country ? { source_country: o.country } : {}),
});

export const interest = (
  account_id: string,
  value_date: string,
  gross: string,
  withholding_spain: string,
): Raw => ({
  type: "interest",
  account_id,
  value_date,
  gross,
  withholding_spain,
  ...fxOf({}, value_date),
});

export const transfer = (
  from_account_id: string,
  from_asset_id: string,
  quantity_out: string,
  nav_out: string,
  value_date_out: string,
  to_account_id: string,
  to_asset_id: string,
  quantity_in: string,
  nav_in: string,
  value_date_in: string,
): Raw => ({
  type: "transfer",
  from_account_id,
  from_asset_id,
  quantity_out,
  nav_out,
  value_date_out,
  to_account_id,
  to_asset_id,
  quantity_in,
  nav_in,
  value_date_in,
});

export const corporateAction = (
  kind: string,
  asset_id: string,
  effective_date: string,
  effects: unknown[],
  regime?: boolean,
): Raw => ({
  type: "corporate_action",
  kind,
  asset_id,
  effective_date,
  source_document: `https://issuer.example/${asset_id}/${kind}.pdf`,
  effects,
  ...(regime === undefined ? {} : { neutrality_regime: regime }),
});

export const valuation = (
  account_id: string,
  asset_id: string,
  date: string,
  quantity: string,
  unit_value: string,
): Raw => ({
  type: "valuation",
  account_id,
  asset_id,
  date,
  quantity,
  unit_value,
  ...fxOf({}, date),
  source: "manual",
});

export const thesis = (
  thesis_id: string,
  account_id: string,
  asset_id: string,
  at: string,
): Raw => ({
  type: "thesis_opened",
  thesis_id,
  account_id,
  asset_id,
  hypothesis: "synthetic",
  expected_horizon_days: 365,
  invalidation: "synthetic",
  planned_size_eur: "500",
  at,
});

const dateOf = (e: Raw): string =>
  (e.at ??
    e.trade_date ??
    e.value_date ??
    e.effective_date ??
    e.value_date_out ??
    e.date) as string;

/** A case: its accounts, assets and events, in the order they were recorded. */
export interface Case {
  accounts: Raw[];
  assets: Raw[];
  events: Raw[];
  settings?: Partial<Settings>;
}

/**
 * The ledger of a case: the settings first (recorded on 01/01/2020), then the
 * catalogue and the events, each recorded on its own date and never before the
 * previous one. Ids and fingerprints are the ledger builder's.
 */
export const ledgerOf = (c: Case): LedgerEvent[] => {
  const b = new LedgerBuilder();
  let recorded = "2020-01-01";
  const add = (event: Raw, at?: string): void => {
    if (at !== undefined && at > recorded) {
      recorded = at;
    }
    b.recordedAt(recorded);
    const { at: _at, ...fields } = event;
    const draft = { ...b.nextEnvelope(fields.type as LedgerEvent["type"]), ...fields };
    const fingerprint = fingerprintOf(draft as never);
    b.raw(
      (fingerprint === undefined ? draft : { ...draft, fingerprint }) as unknown as LedgerEvent,
    );
  };
  b.recordedAt(recorded);
  b.settings({ ...CASE_SETTINGS, ...c.settings });
  for (const a of c.accounts) {
    add(a);
  }
  for (const a of c.assets) {
    add(a);
  }
  for (const e of c.events) {
    add(e, dateOf(e));
  }
  return b.build();
};
