// The fiscal edge cases of the scenario: the loss followed by a purchase, the sale at the end of the
// year, the correction of the year before, the loss of the second share, the money-market sale, the
// withdrawal and the transfer still pending.

import { type CivilDate, lastWorkingDay } from "../../dates/civil-date.js";
import type { Decimal } from "../../money/decimal.js";
import type { BuyEvent, DividendEvent, SellEvent } from "../../schema/events.js";
import { addDays } from "../calendar.js";
import type { ScenarioContext } from "./context.js";
import { cents, d, LATE_BUY_DATE, pct, units } from "./data.js";
import { worldNav } from "./opening.js";
import { closeThesis, sellStock } from "./ops.js";

export const lossSaleAndLateBuy = (c: ScenarioContext, trade: CivilDate): void => {
  const { b } = c;
  const value = addDays(trade, 2);
  const quantity = units(b.position("acc_mi", "ast_world").value.mul(d("0.3")));
  const lateNav = worldNav(c);
  const price = cents((c.minWorldNav as Decimal).mul(d("0.9")));
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
    fx_rate_date: lastWorkingDay(value),
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
    fx_rate_date: lastWorkingDay(LATE_BUY_DATE),
    fee: "0",
    source: "manual",
    notes: "Found in an old statement; recorded late",
  });
};

export const yearEndSale = (c: ScenarioContext): void => {
  const price = cents(d(c.p.alphaPrice).mul(d("1.3")));
  sellStock(c, "ast_alpha", "2027-12-30", "2028-01-02", price, "th_alpha");
  closeThesis(c, "th_alpha", "2027-12-30");
};

export const priorYearCorrection = (c: ScenarioContext, date: CivilDate): void => {
  const wrong = c.wrongDividend as DividendEvent;
  c.b.record(date, {
    type: "reversal",
    reverses_id: wrong.id,
    reason: "withholding_spain typed wrong",
  });
  const { schema_version: _v, id: _id, recorded_at: _at, fingerprint: _fp, ...fields } = wrong;
  c.b.record<DividendEvent>(date, {
    ...fields,
    withholding_spain: pct(wrong.gross, "0.19"),
    corrects_id: wrong.id,
  });
};

export const betaLossSale = (c: ScenarioContext, date: CivilDate): void => {
  const price = cents(d(c.p.betaPrice).mul(d("3")).mul(d("0.7")));
  sellStock(c, "ast_beta_new", date, addDays(date, 2), price, "th_beta_new");
  closeThesis(c, "th_beta_new", date);
};

export const moneyMarketSale = (c: ScenarioContext, trade: CivilDate): void => {
  const value = addDays(trade, 1);
  c.b.record<SellEvent>(value, {
    type: "sell",
    account_id: "acc_mi",
    asset_id: "ast_mm",
    trade_date: trade,
    value_date: value,
    quantity: units(c.b.position("acc_mi", "ast_mm").value.mul(d("0.4"))),
    unit_price: c.b.rng.decimal(100.5, 102, 2),
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: lastWorkingDay(value),
    fee: "0",
    withholding: "1.50",
    source: "manual",
  });
};

export const withdrawal = (c: ScenarioContext, date: CivilDate): void => {
  c.b.record(date, {
    type: "cash_withdrawal",
    account_id: "acc_mi",
    value_date: date,
    amount: "200",
    currency: "EUR",
    fx_rate: "1",
    // 2028-04-08 is a Saturday: the ECB publishes nothing, so the rate that
    // applies is Friday's. It is the one date of the whole scenario where
    // this matters, and it is the reason the helper exists.
    fx_rate_date: lastWorkingDay(date),
    notes: "Cash moved back to the bank",
  });
};

export const pendingRequest = (c: ScenarioContext, date: CivilDate): void => {
  c.b.record(date, {
    type: "transfer_requested",
    from_account_id: "acc_mi",
    from_asset_id: "ast_world",
    to_account_id: "acc_mi",
    to_asset_id: "ast_smallcap_b",
    quantity_out: units(c.b.position("acc_mi", "ast_world").value.mul(d("0.1"))),
    requested_date: date,
    notes: "Still in transit at the end of the ledger",
  });
};
