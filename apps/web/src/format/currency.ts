// How a currency is written after its figure. Apart from `money.ts` because a
// form writes it too, inside an amount field, and only `Amount` may paint a
// figure (decision (d)): the unit of a field is not a figure.

/**
 * The euro with its sign, as Spanish typography does ("1.234,56 €"), every
 * other currency with its ISO code ("123,49 USD"), which is less ambiguous than
 * a sign shared by several countries (brief §8).
 */
export const currencyUnit = (currency: string): string => (currency === "EUR" ? "€" : currency);
