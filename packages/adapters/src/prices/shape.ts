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
