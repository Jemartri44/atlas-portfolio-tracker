// The tax report as plain JSON (feature 009): decimals as strings, keys sorted,
// nothing that depends on the moment of execution except the date of the query
// the caller passed in. It is what `atlas tax --json` prints and what the proof
// without prices compares byte for byte.

import { Decimal } from "../money/decimal.js";
import { Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import { sortKeysDeep } from "../projections/snapshot.js";
import type { TaxBoxes } from "./boxes/report.js";
import type { TaxYearReport } from "./report.js";

const isConverted = (value: Record<string, unknown>): boolean =>
  value.amount instanceof Money && "fx_rate" in value && "eur" in value;

const plain = (value: unknown): unknown => {
  if (value instanceof Money) {
    return value.amount.toString();
  }
  if (value instanceof Quantity || value instanceof Decimal) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(plain);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      result[key] = plain(entry);
    }
    // An amount in the currency of the operation says which currency it is.
    if (isConverted(record)) {
      result.currency = (record.amount as Money).currency;
    }
    return result;
  }
  return value;
};

export const taxReportJson = (report: TaxYearReport): Record<string, unknown> =>
  sortKeysDeep(plain(report)) as Record<string, unknown>;

/**
 * The same for the layout by box. It is what `atlas tax --boxes --json` prints
 * and what the proof without prices compares byte for byte, so it goes through
 * the same door: decimals as strings, keys sorted, nothing that depends on the
 * moment of execution.
 */
export const taxBoxesJson = (boxes: TaxBoxes): Record<string, unknown> =>
  sortKeysDeep(plain(boxes)) as Record<string, unknown>;
