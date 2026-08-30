// Price = money per unit.

import type { Decimal } from "./decimal.js";
import { type Currency, Money } from "./money.js";
import type { Quantity } from "./quantity.js";

export class Price {
  private constructor(
    readonly amount: Decimal,
    readonly currency: Currency,
  ) {}

  static of(amount: Decimal, currency: Currency): Price {
    return new Price(amount, currency);
  }

  static parse(text: unknown, currency: Currency): Price {
    return new Price(Money.parse(text, currency).amount, currency);
  }

  /** Exact: quantity × unit price. */
  times(quantity: Quantity): Money {
    return Money.of(this.amount.mul(quantity.value), this.currency);
  }

  toString(): string {
    return `${this.amount.toString()} ${this.currency}`;
  }
}
