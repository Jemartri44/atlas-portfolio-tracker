// The tax a sale would bring, estimated before it is placed (feature 028).
//
// The sale is added to a **copy of the ledger in memory** and the engine reads
// the year with and without it, so the FIFO across accounts, the compensation
// and the repurchase rule come out of the same code that will compute the real
// one. Nothing is written and the copy is thrown away. The brackets of the
// savings base are then applied to both bases: the engine gives the base, not the
// quota, and the tax of the sale is the difference (marginal, because the
// brackets are progressive).
//
// It is an estimate at today's informative price, labelled as such. It never
// feeds a tax output: the real sale, when it is recorded, is computed from the
// ledger like any other (constitution II).

import type { CivilDate } from "../dates/civil-date.js";
import { yearOf } from "../dates/civil-date.js";
import { systemUlid } from "../ids/ulid.js";
import { Decimal } from "../money/decimal.js";
import { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import { CURRENT_SCHEMA_VERSION } from "../schema/envelope.js";
import type { AccountId, AssetId, LedgerEvent, SellEvent } from "../schema/events.js";
import { fingerprintOf } from "../schema/fingerprint.js";
import type { TaxBracket } from "../settings/defaults.js";
import type { TransmissionLine, TransmissionLot } from "../tax/report.js";
import { taxYear } from "../tax/year.js";

const HUNDRED = Decimal.parse("100");

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
  /** The savings base of the year with the sale, and what it added to it. */
  base_after_eur: Money;
  base_added_eur: Money;
  /** Absent when the brackets are not configured: the tax is then unknown, never zero. */
  tax_eur?: Money;
  /** The synthetic event, so that the next estimate can build on it. */
  event: LedgerEvent;
}

/** Tax of a savings base under progressive brackets whose `up_to` are cumulative limits. */
export const taxOfBase = (base: Money, brackets: readonly TaxBracket[]): Money => {
  let tax = Money.zero("EUR");
  let from = Money.zero("EUR");
  for (const bracket of brackets) {
    const limit = bracket.up_to === undefined ? undefined : Money.parse(bracket.up_to, "EUR");
    const top = limit === undefined || limit.cmp(base) >= 0 ? base : limit;
    if (top.cmp(from) > 0) {
      tax = tax.add(top.sub(from).mul(Decimal.parse(bracket.rate_pct)).div(HUNDRED));
    }
    if (top === base) {
      break;
    }
    from = top;
  }
  return tax;
};

const sellOf = (date: CivilDate, sale: HypotheticalSale, sequence: number): SellEvent => {
  const draft = {
    schema_version: CURRENT_SCHEMA_VERSION,
    id: systemUlid(new Date(`${date}T12:00:00.000Z`), sequence),
    recorded_at: `${date}T12:00:00.000Z`,
    type: "sell" as const,
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
  const fingerprint = fingerprintOf(draft as unknown as SellEvent);
  return (fingerprint === undefined ? draft : { ...draft, fingerprint }) as unknown as SellEvent;
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
  const { report, line } = lineOf([...base, event], year, date, event.id);
  const own = line as TransmissionLine;
  const added = report.base_eur.sub(without.base_eur);
  return {
    gain_eur: own.own_eur,
    cost_eur: own.cost_eur,
    lots: own.lots,
    // The engine keeps a deferred loss with the sign of the loss; here it is an amount.
    deferred_eur: own.deferred_eur.isNegative() ? own.deferred_eur.neg() : own.deferred_eur,
    ...(own.deferral === undefined ? {} : { deferral_window_end: own.deferral.window_end }),
    base_after_eur: report.base_eur,
    base_added_eur: added,
    ...(brackets === undefined
      ? {}
      : {
          tax_eur: taxOfBase(report.base_eur, brackets).sub(taxOfBase(without.base_eur, brackets)),
        }),
    event,
  };
};
