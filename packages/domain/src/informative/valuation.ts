// What an asset is worth **at 31 December**, for the Modelo 720 and the 721
// (feature 010, block 3; criterion #11).
//
// This is the only fiscal calculation of the project that reads a price, and it
// reads it only at **level 1**: a registered `valuation`, which is a decision of
// the user, through the manual leaf (`projections/manual-price.ts`), which
// knows nothing of the automatic quotes (feature 013). The specification
// makes the year-end photograph a manual datum on purpose (§7.1 and §14.1);
// an automatic quote of phase 4 must never walk into a tax return.
//
// The rule of the dates has two halves and they are not the same:
//
//   - the **valuation** is dated 31 December even when that is a Sunday, and it
//     carries the close of the last day the market traded;
//   - the **rate** cannot be dated on a weekend, because the ECB does not
//     publish then: it is the last Monday-to-Friday day on or before
//     31 December. The ECB published on every 31 December that fell on a
//     weekday from 2018 to 2025 (nota N5).
//
// Anything that does not meet them is shown **with its date and marked**. The
// value exists; it is not the one the rule asks for, and saying so is what
// keeps a verdict from resting on it without anybody noticing.

import { type CivilDate, lastWorkingDay } from "../dates/civil-date.js";
import { DomainError } from "../errors.js";
import { FxRate } from "../money/fx-rate.js";
import { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import type { KnownFxRate } from "../projections/fx-rates.js";
import { manualPriceAt } from "../projections/manual-price.js";
import type { LedgerState } from "../projections/state.js";
import type { AssetId } from "../schema/events.js";
import type { ValueFlag } from "./report.js";

const EUR = "EUR";

/**
 * The rate the ledger knows for a currency, **which it always does** when it
 * holds a balance in it: a balance implies an operation in that currency, and
 * every operation carries its ECB rate as published (ADR-0013). What the ledger
 * can be short of is a rate **of 31 December**, and that is marked, not missing.
 *
 * The invariant is not left to a comment. If it ever broke, a valuation of the
 * 720 would be one conversion short and the amount would come out plausible and
 * wrong, which is the one thing this application does not do: it throws, loudly
 * and at the point of the fault, with the currency in the error.
 */
const rateFor = (state: LedgerState, currency: string): KnownFxRate => {
  const known = state.fxRates.get(currency);
  if (known === undefined) {
    throw new DomainError(
      "fx_rate_unknown",
      `the ledger holds ${currency} and knows no ECB rate for it: it cannot be valued`,
      { currency },
    );
  }
  return known;
};

export interface ValuedAsset {
  /** Rounded half-up to cents **once**, which is what the category adds up (#6). */
  value_eur?: Money;
  valuation_date?: CivilDate;
  unit_value?: string;
  fx_rate?: string;
  fx_rate_date?: CivilDate;
  flags: ValueFlag[];
}

/** 31 December of the year, and the day of the rate that values it. */
export const yearEnd = (year: number): CivilDate => `${year}-12-31`;
export const rateDayOf = (year: number): CivilDate => lastWorkingDay(yearEnd(year));

/**
 * The value of a holding of `assetId` at 31 December.
 *
 * `undefined` for the value when there is no registered valuation at all: a
 * missing price is never interpolated and never replaced by a zero
 * (constitution V), and the verdict has its own answer for that.
 */
export const valueAt = (
  state: LedgerState,
  assetId: AssetId,
  quantity: Quantity,
  year: number,
): ValuedAsset => {
  const end = yearEnd(year);
  // **Level 1 only**, and structurally so (feature 013, §6.5 (a) of its
  // prompt): the manual leaf takes no external source at all, and an
  // architecture test reads the import graph so that nothing of this folder
  // reaches the price gate or an automatic quote, at any depth. A runtime
  // check of an origin would be a branch no test could reach, which is worse
  // than the rule written where it is enforced.
  const price = manualPriceAt(state, assetId, end);
  if (price === undefined) {
    return { flags: ["price_missing"] };
  }
  const flags: ValueFlag[] = [];
  if (price.date !== end) {
    flags.push("valuation_not_year_end");
  }
  // In euros there is no rate: the ECB publishes none of the euro against
  // itself, so its date says nothing and marking it would be noise.
  if (price.currency !== EUR && price.fx_rate_date !== rateDayOf(year)) {
    flags.push("rate_not_year_end");
  }
  return {
    value_eur: Money.of(price.unit_value_eur.amount.mul(quantity.value), EUR).roundToCents(),
    valuation_date: price.date,
    unit_value: price.unit_value.toString(),
    fx_rate: price.fx_rate.toString(),
    fx_rate_date: price.fx_rate_date,
    flags,
  };
};

/**
 * The same for a balance in a currency: the rate the **ledger** knows at
 * 31 December, and the same rule of dates.
 *
 * A currency the ledger never priced simply has no value in euros
 * (`rate_missing`). There is no event for noting a rate by hand, so a balance
 * in a currency nothing else trades in can only be resolved by registering a
 * valuation of something in it — which is what the output says (S5, Q5).
 */
export const cashValueAt = (
  state: LedgerState,
  currency: string,
  amount: Money,
  year: number,
): ValuedAsset => {
  if (currency === EUR) {
    return { value_eur: amount.roundToCents(), fx_rate: "1", flags: [] };
  }
  const known = rateFor(state, currency);
  const flags: ValueFlag[] = known.date === rateDayOf(year) ? [] : ["rate_not_year_end"];
  return {
    value_eur: FxRate.of(known.rate, currency, known.date).toEur(amount).roundToCents(),
    fx_rate: known.rate.toString(),
    fx_rate_date: known.date,
    flags,
  };
};

/** The same conversion without rounding, for an average that is added up before it is rounded. */
export const toEurAt = (state: LedgerState, currency: string, amount: Money): Money => {
  if (currency === EUR) {
    return amount;
  }
  const known = rateFor(state, currency);
  return FxRate.of(known.rate, currency, known.date).toEur(amount);
};
