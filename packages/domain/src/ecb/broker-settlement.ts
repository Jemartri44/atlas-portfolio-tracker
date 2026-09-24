// What the broker moved in euros, next to what the ECB rate says (ADR-0030).
//
// **The only module of the domain, besides the validation, that reads
// `broker_settled_eur`** — the architecture test keeps the list closed. It
// computes nothing the ledger uses: no projection, no tax figure and no
// balance reads the field (the dispute of criterion #4 is not decided here).
// It only puts the two figures side by side so the interfaces can show them
// in the detail of a movement: the euros of the statement, and the same
// movement at the ECB rate the ledger recorded.
//
// The movement at the ECB rate is the one the account sees, the side the
// broker's figure describes: a purchase costs the gross plus the fee, a sale
// brings the gross minus the fee and the withholding, a dividend or an
// interest the net that entered, a fee what it charged.

import { Decimal, isDecimalString } from "../money/decimal.js";
import { Money } from "../money/money.js";

export interface BrokerSettlement {
  /** Euros the broker's statement says moved. */
  broker_eur: Money;
  /** The same movement converted at the ECB rate of the line. */
  ecb_eur: Money;
  /** broker − ECB: what the broker's own conversion cost or gave, informative. */
  difference_eur: Money;
}

type Fields = Readonly<Record<string, unknown>>;

const decimal = (value: unknown): Decimal | undefined =>
  isDecimalString(value) ? Decimal.parse(value) : undefined;

const sum = (...values: (Decimal | undefined)[]): Decimal | undefined =>
  values.some((value) => value === undefined)
    ? undefined
    : (values as Decimal[]).reduce((total, value) => total.add(value));

const negate = (value: Decimal | undefined): Decimal | undefined =>
  value === undefined ? undefined : Decimal.ZERO.sub(value);

/** The movement of the account in the currency of the line, or undefined when a figure is missing. */
const movementOf = (event: Fields): Decimal | undefined => {
  switch (event.type) {
    case "buy":
    case "sell": {
      const basis =
        decimal(event.amount) ??
        (decimal(event.quantity) !== undefined && decimal(event.unit_price) !== undefined
          ? (decimal(event.quantity) as Decimal).mul(decimal(event.unit_price) as Decimal)
          : undefined);
      return event.type === "buy"
        ? sum(basis, decimal(event.fee))
        : sum(basis, negate(decimal(event.fee)), negate(decimal(event.withholding ?? "0")));
    }
    case "dividend":
      return sum(
        decimal(event.gross),
        negate(decimal(event.withholding_origin)),
        negate(decimal(event.withholding_spain)),
      );
    case "interest":
      return sum(decimal(event.gross), negate(decimal(event.withholding_spain)));
    case "standalone_fee":
      return decimal(event.amount);
    default:
      return undefined;
  }
};

/**
 * The two figures side by side, for an event (or a draft) that carries
 * `broker_settled_eur`. `undefined` when it does not, when the line is in
 * euros, or when a figure it needs is missing: a draft being typed.
 */
export const brokerSettlementOf = (event: Fields): BrokerSettlement | undefined => {
  const settled = decimal(event.broker_settled_eur);
  const rate = decimal(event.fx_rate);
  const movement = movementOf(event);
  if (
    event.currency === "EUR" ||
    settled === undefined ||
    rate === undefined ||
    movement === undefined ||
    rate.isZero()
  ) {
    return undefined;
  }
  const broker = Money.of(settled, "EUR");
  const ecb = Money.of(movement.div(rate), "EUR");
  return { broker_eur: broker, ecb_eur: ecb, difference_eur: broker.sub(ecb) };
};
