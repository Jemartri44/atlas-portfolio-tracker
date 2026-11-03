// Twenty years of a plain core: a monthly contribution and purchase, a sale and a dividend a year,
// and a dividend from outside the portfolio a year. 548 events: the size the return after tax is
// measured on.

import type { LedgerEvent } from "../../src/schema/events.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

export const LONG_LEDGER_END = "2038-01-04";

export const longLedger = (): LedgerEvent[] => {
  const b = new LedgerBuilder();
  catalogue(b);
  let held = 0;
  for (let year = 2018; year < 2038; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const date = `${year}-${String(month).padStart(2, "0")}-03`;
      b.deposit({ account_id: "acc_fund", amount: "500", value_date: date });
      b.buy({
        account_id: "acc_fund",
        asset_id: "ast_world",
        quantity: "5",
        unit_price: "100",
        trade_date: date,
      });
      held += 5;
    }
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "120",
      value_date: `${year}-12-15`,
    });
    held -= 10;
    b.dividend({
      account_id: "acc_fund",
      asset_id: "ast_world",
      gross: "50",
      value_date: `${year}-06-20`,
      fx_rate_date: `${year}-06-19`,
    });
    b.externalIncome({ value_date: `${year}-07-01`, gross_eur: "1000", withholding_eur: "190" });
  }
  b.valuation({
    account_id: "acc_fund",
    asset_id: "ast_world",
    date: LONG_LEDGER_END,
    quantity: String(held),
    unit_value: "130",
  });
  return b.build();
};
