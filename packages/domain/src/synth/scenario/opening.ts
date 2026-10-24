// The opening of the scenario: the catalogue, the first deposits and the first positions.

import { lastWorkingDay } from "../../dates/civil-date.js";
import type { BuyEvent } from "../../schema/events.js";
import { addDays } from "../calendar.js";
import type { ScenarioContext } from "./context.js";
import { ceil, d, START_DEPOSIT_DATE } from "./data.js";
import { buyStock, catalogue, deposit, fxToUsd, openThesis } from "./ops.js";

export const opening = (c: ScenarioContext): void => {
  const { p, b } = c;
  const start = "2026-09-01";
  catalogue(c, start);
  const alphaCostEur = d(p.alphaQuantity).mul(d(p.alphaPrice)).div(d(p.fx));
  openThesis(c, "th_alpha", "ast_alpha", alphaCostEur, start);
  const yearly = d(p.worldAmount)
    .mul(d("12"))
    .add(d(p.bondsAmount).mul(d("4")));
  deposit(c, "acc_mi", START_DEPOSIT_DATE, yearly.add(d(p.mmAmount)).add(d("1000")).toString());
  const goldUsd = d(p.goldTransferred + p.goldKept)
    .mul(d(p.goldPrice))
    .add(d("1.5"));
  const btcEur = d(p.btcQuantity).mul(d(p.btcPrice)).add(d("1"));
  const ibkrFx = ceil(goldUsd.add(d("2")).div(d(p.fx)).div(d("100")).add(d("1")));
  deposit(c, "acc_ibkr", start, d(ibkrFx).mul(d("100")).add(btcEur).add(d("100")).toString());
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
  deposit(c, "acc_bucket", start, d(bucketFx).mul(d("100")).add(d("100")).toString());

  const fxDay = "2026-09-02";
  fxToUsd(c, "acc_ibkr", fxDay, goldUsd, p.fx);
  fxToUsd(c, "acc_bucket", fxDay, bucketUsd, p.fx);

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
    fx_rate_date: lastWorkingDay(tradeDay),
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
    fx_rate_date: lastWorkingDay(tradeDay),
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
    fx_rate_date: lastWorkingDay(mmValue),
    fee: "0",
    source: "manual",
  });
  buyStock(
    c,
    "acc_bucket",
    "ast_alpha",
    "2026-09-04",
    p.alphaQuantity,
    p.alphaPrice,
    p.fx,
    "th_alpha",
  );
};

export const worldNav = (c: ScenarioContext): string => {
  const nav = c.b.rng.decimal(90, 130, 2);
  if (c.minWorldNav === undefined || d(nav).lt(c.minWorldNav)) {
    c.minWorldNav = d(nav);
  }
  return nav;
};
