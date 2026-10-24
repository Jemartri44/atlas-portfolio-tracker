// The side streams of the scenario, recorded last so that not one id or amount of the rest moves:
// the half-yearly prices of the benchmark and the phase-3 programme of the bucket.

import { type CivilDate, lastWorkingDay } from "../../dates/civil-date.js";
import { positionOf } from "../../projections/positions.js";
import type {
  AssetCreatedEvent,
  AssetId,
  BuyEvent,
  Draft,
  SellEvent,
  ValuationEvent,
} from "../../schema/events.js";
import { addDays, dateOf } from "../calendar.js";
import type { ScenarioContext } from "./context.js";
import { BUCKET_PROGRAMME_ASSETS, cents, d } from "./data.js";

/**
 * Half-yearly prices of the benchmark, from before the first event of the
 * bucket: without them every comparison against the index would be "no data".
 *
 * Recorded in a **side stream** and at the end of the file, so not one id,
 * `recorded_at` or amount of what came before moves. Recording
 * late is normal and does not change the projection (data-schema.md §7.1);
 * the quantity is read at the date of the valuation, with `asOf`.
 */
export const benchmarkPrices = (c: ScenarioContext): void => {
  const stream = c.b.stream("benchmark-valuations");
  for (const [year, month] of [
    [2026, 9],
    [2027, 3],
    [2027, 9],
    [2028, 3],
    [2028, 9],
  ] as const) {
    const date = dateOf(year, month, 1);
    const quantity = positionOf(c.b.stateAsOf(date), "acc_mi", "ast_world");
    stream.record<ValuationEvent>(date, {
      type: "valuation",
      account_id: "acc_mi",
      asset_id: "ast_world",
      date,
      quantity: quantity.toString(),
      unit_value: stream.rng.decimal(90, 130, 2),
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: lastWorkingDay(date),
      source: "manual",
    });
  }
};

/**
 * The bucket programme of phase 3: four more closed theses (two winners, two
 * losers, one of them with two purchases on different dates), one more open,
 * and a **repurchase inside the window** after a loss-making sale, which
 * exercises the wash-sale rule of the bucket. On assets of its own, so no
 * lot, gain or position of what was already there changes.
 */
export const bucketProgramme = (c: ScenarioContext): void => {
  const s = c.b.stream("bucket-programme");
  const created = "2027-01-15";
  for (const asset of BUCKET_PROGRAMME_ASSETS) {
    s.record<AssetCreatedEvent>(created, { type: "asset_created", ...asset, active: true });
  }
  s.record(created, {
    type: "cash_deposit",
    account_id: "acc_bucket",
    value_date: created,
    amount: "3000",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: lastWorkingDay(created),
  });

  const price = (min: number, max: number): string => s.rng.decimal(min, max, 2);
  const trade = (
    type: "buy" | "sell",
    asset_id: AssetId,
    date: CivilDate,
    quantity: number,
    unit_price: string,
    thesis_id: string,
  ): void => {
    s.record<BuyEvent | SellEvent>(date, {
      type,
      account_id: "acc_bucket",
      asset_id,
      trade_date: date,
      value_date: addDays(date, 2),
      quantity: String(quantity),
      unit_price,
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: lastWorkingDay(date),
      fee: "1",
      source: "manual",
      thesis_id,
    } as Draft<BuyEvent | SellEvent>);
  };
  const open = (thesis_id: string, asset_id: AssetId, date: CivilDate, planned: number): void => {
    s.record(date, {
      type: "thesis_opened",
      thesis_id,
      account_id: "acc_bucket",
      asset_id,
      hypothesis: `Synthetic thesis on ${asset_id}`,
      expected_horizon_days: 120,
      invalidation: "Synthetic invalidation rule",
      planned_size_eur: String(planned),
    });
  };
  const close = (thesis_id: string, date: CivilDate): void => {
    s.record(date, { type: "thesis_closed", thesis_id, closing_notes: `${thesis_id} closed` });
  };

  // In ascending date order, so the clock of the stream follows the business
  // dates: a thesis is dated by the `recorded_at` of its opening
  // (data-schema.md §6.4), and recording out of order would leave every
  // thesis stamped on the day of the last event of the block.
  const delta1 = price(18, 24);
  const delta2 = price(20, 30);
  const eps = price(10, 16);

  // A thesis with two purchases on different dates, sold at a profit.
  open("th_delta_1", "ast_delta", "2027-02-01", 1200);
  trade("buy", "ast_delta", "2027-02-10", 20, delta1, "th_delta_1");
  // A loser on the second asset, in parallel.
  open("th_epsilon_1", "ast_epsilon", "2027-03-01", 900);
  trade("buy", "ast_epsilon", "2027-03-05", 40, eps, "th_epsilon_1");
  trade("buy", "ast_delta", "2027-04-12", 10, cents(d(delta1).mul(d("1.1"))), "th_delta_1");
  trade("sell", "ast_epsilon", "2027-05-05", 40, cents(d(eps).mul(d("0.85"))), "th_epsilon_1");
  close("th_epsilon_1", "2027-05-05");
  trade("sell", "ast_delta", "2027-08-10", 30, cents(d(delta1).mul(d("1.35"))), "th_delta_1");
  close("th_delta_1", "2027-08-10");

  // Another loser, and the repurchase inside its two-month window.
  open("th_delta_2", "ast_delta", "2027-09-01", 900);
  trade("buy", "ast_delta", "2027-09-10", 25, delta2, "th_delta_2");
  trade("sell", "ast_delta", "2027-11-10", 25, cents(d(delta2).mul(d("0.7"))), "th_delta_2");
  close("th_delta_2", "2027-11-10");
  open("th_delta_3", "ast_delta", "2027-12-15", 900);
  trade("buy", "ast_delta", "2027-12-20", 25, cents(d(delta2).mul(d("0.72"))), "th_delta_3");

  // And one more winner, the following year.
  open("th_epsilon_2", "ast_epsilon", "2028-01-10", 900);
  trade("buy", "ast_epsilon", "2028-01-15", 35, cents(d(eps).mul(d("0.9"))), "th_epsilon_2");
  trade("sell", "ast_epsilon", "2028-06-15", 35, cents(d(eps).mul(d("1.2"))), "th_epsilon_2");
  close("th_epsilon_2", "2028-06-15");

  // The open position needs a price, or every phase-3 view is partial.
  const lastDay = "2028-12-31";
  s.record<ValuationEvent>(lastDay, {
    type: "valuation",
    account_id: "acc_bucket",
    asset_id: "ast_delta",
    date: lastDay,
    quantity: positionOf(c.b.stateAsOf(lastDay), "acc_bucket", "ast_delta").toString(),
    unit_value: price(20, 32),
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: lastWorkingDay(lastDay),
    source: "manual",
  });
};
