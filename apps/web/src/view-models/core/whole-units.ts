// How many WHOLE units an allocation in euros would buy, and what is left.
//
// Informative only: the proposal in euros is the main figure, and funds accept
// fractions. The split is the domain's and is not touched; this reads one unit
// price per asset (the one of the core weights projection) and does one
// division. The floor is applied to this figure alone, in decimal, never in
// floating point (ADR-0005).

import { type CoreWeightRow, Decimal, Money, Quantity } from "@atlas/domain";

export interface WholeUnits {
  units: Quantity;
  /** `allocation − units × price`: what those whole units leave uninvested. */
  leftover: Money;
}

/** Traded by the unit: a fund or a money-market fund takes fractions, crypto too. */
const BY_UNITS: ReadonlySet<string> = new Set(["etf", "etc", "etp", "stock"]);

/**
 * The unit prices that may back a whole-units figure. Fail safe: only an
 * exact price in euros, fresh and not an approximation, of an asset bought by
 * the unit. Anything else leaves its row without a figure.
 */
export const unitPricesOf = (
  rows: readonly CoreWeightRow[],
  assetTypes: ReadonlyMap<string, string>,
): Map<string, Money> =>
  new Map(
    rows.flatMap((row) => {
      const price = row.price;
      const usable =
        price !== undefined &&
        price.unit_value_eur !== undefined &&
        price.currency === "EUR" &&
        price.stale !== true &&
        price.approximate !== true &&
        BY_UNITS.has(assetTypes.get(row.asset_id) ?? "");
      return usable ? [[row.asset_id, price.unit_value_eur as Money] as const] : [];
    }),
  );

/** The integer part of a non-negative decimal, read from its canonical string. */
const integerPart = (value: Decimal): Decimal =>
  Decimal.parse(value.toString().split(".")[0] ?? "0");

/**
 * Nothing without a positive price or with a negative allocation: no price is
 * not a zero price, and nothing is estimated in silence.
 */
export const wholeUnitsFor = (
  allocation: Money,
  unitPrice: Money | undefined,
): WholeUnits | undefined => {
  if (unitPrice === undefined || !unitPrice.amount.isPositive() || allocation.amount.isNegative()) {
    return undefined;
  }
  const price = unitPrice.amount;
  // The division rounds half-up to 10 decimals, so it can land on the next
  // integer from just below it: check the product and step back if it overshoots.
  let units = integerPart(allocation.amount.div(price));
  if (units.mul(price).gt(allocation.amount)) {
    units = units.sub(Decimal.ONE);
  }
  return {
    units: Quantity.of(units),
    leftover: Money.of(allocation.amount.sub(units.mul(price)), allocation.currency),
  };
};

/** The sum of the leftovers, only when every row has its figure: a partial sum would pass for the whole. */
export const totalLeftover = (rows: readonly (WholeUnits | undefined)[]): Money | undefined => {
  const known = rows.filter((row): row is WholeUnits => row !== undefined);
  if (known.length === 0 || known.length !== rows.length) {
    return undefined;
  }
  return known.reduce((sum, row) => sum.add(row.leftover), Money.parse("0", "EUR"));
};
