// The tax a sale would bring, estimated before it is placed (feature 028).
//
// The sale is added to a **copy of the ledger in memory** and the engine reads
// the year with and without it, so the FIFO across accounts, the compensation
// and the repurchase rule come out of the same code that will compute the real
// one. Nothing is written and the copy is thrown away. The estimated quota of
// both years (`savingsQuota`, criterion #27: the scale of the law of the year,
// or `savings_tax_brackets` when set) gives the tax of the sale as the
// difference of the two cuotas íntegras: marginal, because the scale is
// progressive. It is the same estimate the "what if I sell" query of the
// fiscal screen and the sales of the rebalance show.
//
// It is an estimate at today's informative price, labelled as such. It never
// feeds a tax output: the real sale, when it is recorded, is computed from the
// ledger like any other (constitution II).

import type { CivilDate } from "../dates/civil-date.js";
import { yearOf } from "../dates/civil-date.js";
import { systemUlid } from "../ids/ulid.js";
import type { Decimal } from "../money/decimal.js";
import type { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import { CURRENT_SCHEMA_VERSION } from "../schema/envelope.js";
import type { AccountId, AssetId, LedgerEvent, SellEvent } from "../schema/events.js";
import { fingerprintOf } from "../schema/fingerprint.js";
import type { TaxBracket } from "../settings/defaults.js";
import { type SavingsQuota, savingsQuota } from "../tax/quota.js";
import type { TransmissionLine, TransmissionLot } from "../tax/report.js";
import { taxYear } from "../tax/year.js";

/** What is sold: the quantity and what the market pays for it at the informative price. */
export interface HypotheticalSale {
  account_id: AccountId;
  asset_id: AssetId;
  quantity: Quantity;
  /** Currency the price is quoted in, with the ECB rate of the price (units per EUR). */
  currency: string;
  fx_rate: Decimal;
  fx_rate_date: CivilDate;
  /** Gross amount, in `currency`. */
  amount: string;
  /** Commission, in `currency`. */
  fee: string;
}

export interface SaleEstimate {
  /** Gain (negative: loss) of the sale itself, before any deferral. */
  gain_eur: Money;
  cost_eur: Money;
  /** The lots it consumes, oldest first. */
  lots: TransmissionLot[];
  /** Part of a loss the repurchase rule defers, as a positive amount, and where its window ends. */
  deferred_eur: Money;
  deferral_window_end?: CivilDate;
  /**
   * For a loss: the last day on which buying the asset back would still defer
   * what is left of it (criteria #2 and #14). Absent for a gain.
   */
  repurchase_until?: CivilDate;
  /** The savings base of the year with the sale, and what it added to it. */
  base_after_eur: Money;
  base_added_eur: Money;
  /** The estimated quota of the year without and with the sale. */
  quota_before: SavingsQuota;
  quota_after: SavingsQuota;
  /** `quota_after − quota_before`: negative when a loss saves tax. Always an estimate. */
  tax_eur: Money;
  /** The synthetic event, so that the next estimate can build on it. */
  event: LedgerEvent;
}

const sellOf = (date: CivilDate, sale: HypotheticalSale, sequence: number): SellEvent => {
  const draft: Omit<SellEvent, "fingerprint"> = {
    schema_version: CURRENT_SCHEMA_VERSION,
    id: systemUlid(new Date(`${date}T12:00:00.000Z`), sequence),
    recorded_at: `${date}T12:00:00.000Z`,
    type: "sell",
    account_id: sale.account_id,
    asset_id: sale.asset_id,
    trade_date: date,
    value_date: date,
    quantity: sale.quantity.toString(),
    amount: sale.amount,
    currency: sale.currency,
    fx_rate: sale.fx_rate.toString(),
    fx_rate_date: sale.fx_rate_date,
    fee: sale.fee,
    source: "manual",
  };
  // A sell is always fingerprinted.
  return { ...draft, fingerprint: fingerprintOf(draft) as string };
};

const lineOf = (events: readonly LedgerEvent[], year: number, date: CivilDate, id: string) => {
  const report = taxYear(events, year, { today: date });
  const line: TransmissionLine | undefined = [
    ...report.capital_gains.lines,
    ...report.movable_capital.transmissions,
  ].find((entry) => entry.event_id === id);
  return { report, line };
};

/**
 * Estimates `sale` on top of the ledger and of the hypothetical sales already
 * planned (`before`), which count as done: the estimate of the second sale of a
 * plan sees the gain of the first in the same year's base.
 */
export const estimateSale = (
  events: readonly LedgerEvent[],
  before: readonly LedgerEvent[],
  date: CivilDate,
  sale: HypotheticalSale,
  brackets: readonly TaxBracket[] | undefined,
): SaleEstimate => {
  const year = yearOf(date);
  const event = sellOf(date, sale, before.length + 1);
  const base = [...events, ...before];
  const without = taxYear(base, year, { today: date });
  // The engine refuses a ledger it cannot project (a sale larger than the
  // lots, say), so a report that reaches here always holds the line of the sale.
  const { report, line: found } = lineOf([...base, event], year, date, event.id);
  const own = found as TransmissionLine;
  const added = report.base_eur.sub(without.base_eur);
  const quotaBefore = savingsQuota(without, brackets);
  const quotaAfter = savingsQuota(report, brackets);
  // What the rule would still defer with a repurchase: the own loss minus what is deferred already.
  const open = own.own_eur.isNegative() && own.deferred_eur.cmp(own.own_eur) > 0;
  return {
    gain_eur: own.own_eur,
    cost_eur: own.cost_eur,
    lots: own.lots,
    // The engine keeps a deferred loss with the sign of the loss; here it is an amount.
    deferred_eur: own.deferred_eur.isNegative() ? own.deferred_eur.neg() : own.deferred_eur,
    ...(own.deferral === undefined ? {} : { deferral_window_end: own.deferral.window_end }),
    // A loss priced on `date` has its window open on `date`: the engine always marks it.
    ...(open ? { repurchase_until: own.provisional_until as CivilDate } : {}),
    base_after_eur: report.base_eur,
    base_added_eur: added,
    quota_before: quotaBefore,
    quota_after: quotaAfter,
    // The scales start at the first year the engine computes (`savings-scale.ts`), so both have a quota.
    tax_eur: (quotaAfter.quota_eur as Money).sub(quotaBefore.quota_eur as Money),
    event,
  };
};
