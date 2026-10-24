// The synthetic scenario: a fixed skeleton of accounts, assets and monthly blocks from 2026-09 to
// 2028-12 that contains every event type and every rare case the later features need, with
// amounts, prices, rates and day-of-month jitter drawn from the seed. Nothing here is real:
// invented ids, ISINs `XX…`, round amounts.
//
// The pieces live in `scenario/`: `data.ts` (the fixed catalogue and the parameters of the seed),
// `ops.ts` (what one record of each kind looks like), `opening.ts`, `corporate.ts` and `fiscal.ts`
// (the blocks of the timeline by theme) and `streams.ts` (the side streams recorded last). This
// file is the timeline: which block goes in which month.

import type { LedgerEvent } from "../schema/events.js";
import { addDays, dateOf, monthAt } from "./calendar.js";
import { createContext, type ScenarioContext } from "./scenario/context.js";
import {
  custodyTransfer,
  delisting,
  fundMerger,
  identifierChange,
  merger,
  reverseSplit,
  shareClassChange,
  spinOff,
} from "./scenario/corporate.js";
import {
  cents,
  d,
  MONTHS,
  settingsWith,
  TARGET_WEIGHTS_AFTER_CONVERSIONS,
  TARGET_WEIGHTS_LATER,
} from "./scenario/data.js";
import {
  betaLossSale,
  lossSaleAndLateBuy,
  moneyMarketSale,
  pendingRequest,
  priorYearCorrection,
  withdrawal,
  yearEndSale,
} from "./scenario/fiscal.js";
import { opening, worldNav } from "./scenario/opening.js";
import {
  buyStock,
  contribution,
  corporateAction,
  deposit,
  dividendAlpha,
  fee,
  fundTransfer,
  interest,
  openThesis,
  rate,
  yearEndValuations,
} from "./scenario/ops.js";
import { benchmarkPrices, bucketProgramme } from "./scenario/streams.js";

export interface GenerateOptions {
  seed: number;
}

/**
 * Warning codes the scenario provokes on purpose: the ETC held in two IBKR
 * accounts, and the two directions of the wash-sale window. The
 * loss-making sale of the fund followed by the monthly contributions inside the
 * year was already in the scenario as a mandatory edge case (constitution VII):
 * what is new is that the application now sees it.
 */
export const SYNTHETIC_EXPECTED_WARNINGS: readonly string[] = [
  "same_asset_two_accounts",
  "wash_sale_window_prior_buy",
  "wash_sale_window_repurchase",
];

const run = (c: ScenarioContext): LedgerEvent[] => {
  const { p, b } = c;
  opening(c);
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
      contribution(c, "ast_world", p.worldAmount, day, worldNav(c), m !== MONTHS - 1);
    }
    if (m % 3 === 0) {
      const bonds = m >= 19 ? "ast_bonds_i" : "ast_bonds";
      contribution(c, bonds, p.bondsAmount, addDays(day, 1), b.rng.decimal(95, 110, 2), true);
    }

    switch (m) {
      case 1:
        openThesis(
          c,
          "th_beta",
          "ast_beta",
          d(p.betaQuantity).mul(d(p.betaPrice)).div(d(p.fx)),
          block,
        );
        buyStock(
          c,
          "acc_bucket",
          "ast_beta",
          block,
          p.betaQuantity,
          p.betaPrice,
          rate(c),
          "th_beta",
        );
        interest(c, dateOf(year, month, 28));
        break;
      case 2:
        dividendAlpha(c, addDays(block, 7), "0.19");
        break;
      case 3:
        fee(c, dateOf(year, month, 15), "Custody fee");
        yearEndValuations(c, year);
        break;
      case 4:
        // Before the first fund transfer, so that the sale (not the transfer) consumes the late buy.
        lossSaleAndLateBuy(c, block);
        break;
      case 6:
        fundTransfer(c, "ast_world", "ast_smallcap", "0.4", block, ["redeemed"]);
        break;
      case 7:
        c.wrongDividend = dividendAlpha(c, addDays(block, 7), "0");
        break;
      case 8:
        custodyTransfer(c, block);
        break;
      case 9:
        reverseSplit(c, block);
        break;
      case 10:
        openThesis(
          c,
          "th_gamma",
          "ast_gamma",
          d(p.gammaQuantity + p.gammaSecondQuantity)
            .mul(d(p.gammaPrice))
            .mul(d("1.4"))
            .div(d(p.fx)),
          block,
        );
        buyStock(
          c,
          "acc_bucket",
          "ast_gamma",
          block,
          p.gammaQuantity,
          p.gammaPrice,
          rate(c),
          "th_gamma",
        );
        break;
      case 11:
        fundTransfer(c, "ast_smallcap", "ast_bonds", "0.5", block, ["redeemed", "subscribed"]);
        break;
      case 12:
        b.record(day, {
          type: "settings_changed",
          settings: settingsWith(TARGET_WEIGHTS_LATER, p.worldAmount),
        });
        deposit(
          c,
          "acc_mi",
          day,
          d(p.worldAmount)
            .mul(d("12"))
            .add(d(p.bondsAmount).mul(d("4")))
            .add(d("500"))
            .toString(),
        );
        identifierChange(c, block);
        break;
      case 13:
        spinOff(c, block);
        break;
      case 14:
        corporateAction(c, "split", "ast_gamma", block, [{ op: "scale", ratio: "2" }], "2:1 split");
        merger(c, addDays(block, 1));
        break;
      case 15:
        yearEndSale(c);
        yearEndValuations(c, year);
        break;
      case 16:
        priorYearCorrection(c, block);
        delisting(c, addDays(block, 1));
        betaLossSale(c, addDays(block, 2));
        break;
      case 17:
        fundMerger(c, block);
        break;
      case 18:
        shareClassChange(c, block);
        // The plan follows the assets it now owns.
        b.record(addDays(block, 1), {
          type: "settings_changed",
          settings: settingsWith(TARGET_WEIGHTS_AFTER_CONVERSIONS, p.worldAmount),
        });
        break;
      case 19:
        interest(c, dateOf(year, month, 28));
        withdrawal(c, block);
        break;
      case 20:
        moneyMarketSale(c, block);
        break;
      case 21:
        fee(c, dateOf(year, month, 15), "Market data fee");
        break;
      case 24:
        deposit(
          c,
          "acc_mi",
          day,
          d(p.worldAmount)
            .mul(d("12"))
            .add(d(p.bondsAmount).mul(d("4")))
            .add(d("500"))
            .toString(),
        );
        buyStock(
          c,
          "acc_bucket",
          "ast_gamma",
          block,
          p.gammaSecondQuantity,
          cents(d(p.gammaPrice).mul(d("1.2"))),
          rate(c),
          "th_gamma",
        );
        break;
      case 26:
        pendingRequest(c, block);
        break;
      case 27:
        yearEndValuations(c, year);
        break;
      default:
        break;
    }
  }
  // Side streams last: what they record does not move a byte of the above.
  benchmarkPrices(c);
  bucketProgramme(c);
  return b.events;
};

/** Deterministic synthetic ledger: same seed, same bytes. */
export const generateLedger = ({ seed }: GenerateOptions): LedgerEvent[] =>
  run(createContext(seed));
