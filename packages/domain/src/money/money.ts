// Money = amount + ISO 4217 currency. Operating across currencies is rejected;
// conversion only exists through an FxRate (ADR-0005).

import { CurrencyMismatchError, ValidationError } from "../errors.js";
import { Decimal } from "./decimal.js";

export type Currency = string;

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export const EUR: Currency = "EUR";

export const isCurrency = (value: unknown): value is Currency =>
  typeof value === "string" && CURRENCY_PATTERN.test(value);

export const assertCurrency = (value: unknown, field: string): Currency => {
  if (!isCurrency(value)) {
    throw new ValidationError("invalid_currency", `${field} must be an ISO 4217 code`, {
      field,
      value,
    });
  }
  return value;
};

export class Money {
  private constructor(
    readonly amount: Decimal,
    readonly currency: Currency,
  ) {}

  static of(amount: Decimal, currency: Currency): Money {
    return new Money(amount, currency);
  }

  static parse(text: unknown, currency: Currency): Money {
    return new Money(Decimal.parse(text), currency);
  }

  static zero(currency: Currency): Money {
    return new Money(Decimal.ZERO, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.add(other.amount), this.currency);
  }

  sub(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.sub(other.amount), this.currency);
  }

  mul(factor: Decimal): Money {
    return new Money(this.amount.mul(factor), this.currency);
  }

  div(divisor: Decimal): Money {
    return new Money(this.amount.div(divisor), this.currency);
  }

  neg(): Money {
    return new Money(this.amount.neg(), this.currency);
  }

  cmp(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return this.amount.cmp(other.amount);
  }

  eq(other: Money): boolean {
    return this.currency === other.currency && this.amount.eq(other.amount);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  /** Half-up rounding to cents. Only for fiscal output and display. Idempotent. */
  roundToCents(): Money {
    return new Money(this.amount.round(2), this.currency);
  }

  /**
   * Sum of the figures **as they are shown**: each one rounded to cents before
   * being added. A reader who adds up the printed column has to get the printed
   * total, which is the promise of the one view whose mandate is to stay broken
   * down (constitution III); the exact value stays available separately.
   *
   * `undefined` is a figure that is **missing**, not a zero: it is skipped, and
   * saying that the total is partial is the caller's job.
   *
   * It lives here because it is arithmetic over money and not text: the CLI and
   * the web each carried this same reduce, with the same comment, and two
   * copies of a rule about money drift apart.
   */
  static sumShown(values: readonly (Money | undefined)[], currency: Currency): Money {
    return values.reduce<Money>(
      (total, value) => (value === undefined ? total : total.add(value.roundToCents())),
      Money.zero(currency),
    );
  }

  /**
   * The amount to the cent, **always two decimals**, with no currency: the
   * shape a figure has when it is typed into a tax form, and the shape it is
   * written into the ledger with.
   *
   * It lives here for the reason `sumShown` does: the console, the web and the
   * proposal of a filing each carried this same `split(".")` and `padEnd`
   * under the name `cents` —six copies— and two of them printed the same
   * figure differently on screens the user opens one after the other. A rule
   * about how money reads is one rule.
   */
  centsText(): string {
    const [whole, fraction = ""] = this.roundToCents().amount.toString().split(".");
    return `${whole}.${fraction.padEnd(2, "0")}`;
  }

  toString(): string {
    return `${this.amount.toString()} ${this.currency}`;
  }
}
