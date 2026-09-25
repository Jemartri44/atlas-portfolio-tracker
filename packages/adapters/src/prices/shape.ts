import type { DailyClose } from "@atlas/domain/quotes";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * One close from the pieces of an answer, or `undefined` when they are not a
 * close: a date `YYYY-MM-DD` and a positive decimal text, never an exponent
 * and never a float. Nothing that does not read is ever a price.
 */
export const closeOf = (date: unknown, close: unknown): DailyClose | undefined =>
  typeof date === "string" &&
  DATE.test(date) &&
  typeof close === "string" &&
  DECIMAL.test(close) &&
  /[1-9]/.test(close)
    ? { date, close }
    : undefined;

/**
 * What a source's metadata say of the currency of a listing. Nothing, when
 * they give nothing or say they do not know («Unknown»); **anything else is
 * said as it is**, also what is not a code of three capitals (`GBp`): it is
 * then a disagreement the user confirms, never the silence of a source that
 * says nothing (decision D-Q2; second pass of the review of PR #78).
 */
export const saidCurrency = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" && value.trim() !== "Unknown"
    ? value.trim().slice(0, 16)
    : undefined;
