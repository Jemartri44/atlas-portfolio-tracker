// ECB reference rate as published: units of `currency` per EUR, with its date.
// Conversion: eur = amount / rate (ADR-0013). EUR itself uses rate "1".

import type { CivilDate } from "../dates/civil-date.js";
import { CurrencyMismatchError, ValidationError } from "../errors.js";
import { Decimal } from "./decimal.js";
import { type Currency, EUR, Money } from "./money.js";

export class FxRate {
  private constructor(
    readonly rate: Decimal,
    readonly currency: Currency,
    readonly date: CivilDate,
  ) {}

  static of(rate: Decimal, currency: Currency, date: CivilDate): FxRate {
    if (!rate.isPositive()) {
      throw new ValidationError("invalid_fx_rate", "fx_rate must be greater than zero", {
        value: rate.toString(),
      });
    }
    if (currency === EUR && !rate.eq(Decimal.ONE)) {
      throw new ValidationError("invalid_fx_rate", 'fx_rate must be "1" for EUR', {
        value: rate.toString(),
      });
    }
    return new FxRate(rate, currency, date);
  }

  /** `money / rate`, 10 decimals. Rejects money in another currency. */
  toEur(money: Money): Money {
    if (money.currency !== this.currency) {
      throw new CurrencyMismatchError(money.currency, this.currency);
    }
    return Money.of(money.amount.div(this.rate), EUR);
  }

  toString(): string {
    return `${this.rate.toString()} ${this.currency}/EUR @ ${this.date}`;
  }
}
