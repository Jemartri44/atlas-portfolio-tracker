// **The second module allowed to format money**, and the only one that is not
// `Amount` (Q5 of prompt 007, authorised by the direction with a condition that
// is a test, not a promise).
//
// uPlot asks for functions that take numbers and give back the labels of an
// axis and of a tooltip. There is no component to go through in there, so the
// rule of the privacy gate — one enumerated place formats an amount — becomes
// two enumerated places. The architecture test lists both, with this reason.
//
// The criterion the direction stated out loud: **the axis of a chart is an
// amount for every purpose**. With the privacy mode on there can be no absolute
// figure on it. If that leaves the chart lame in public, it stays lame: that is
// exactly what the privacy mode promises.

import { MASK } from "../../format/money.js";
import { formatDecimalString } from "../../format/number.js";

/**
 * Thousands and millions, so an axis of a twenty-year ledger stays readable.
 * `toFixed` first: `String(1e-7)` is `"1e-7"`, which the decimal formatter would
 * have to understand and should not have to.
 */
const compact = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${formatDecimalString((value / 1_000_000).toFixed(1), { decimals: 1 })} M`;
  }
  if (abs >= 1_000) {
    return `${formatDecimalString((value / 1_000).toFixed(0), { decimals: 0 })} k`;
  }
  return formatDecimalString(value.toFixed(0), { decimals: 0 });
};

/**
 * A euro figure for an axis or a tooltip. With privacy on it is the mask, with
 * no exception and no "it is only an axis": twelve units of a fund with a public
 * price give the amount away just as well as the amount.
 */
export const axisAmount = (value: number | null | undefined, privacy: boolean): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }
  return privacy ? MASK : compact(value);
};

/** A date of the X axis: the day is noise on a five-year range, and vital on a month. */
export const axisDate = (timestamp: number, span: "days" | "months" | "years"): string => {
  const date = new Date(timestamp * 1000);
  const month = date.toLocaleDateString("es-ES", { month: "short", timeZone: "UTC" });
  if (span === "years") {
    return String(date.getUTCFullYear());
  }
  if (span === "months") {
    return `${month} ${String(date.getUTCFullYear()).slice(2)}`;
  }
  return `${date.getUTCDate()} ${month}`;
};

/** Which of the three date spans a range of seconds deserves. */
export const spanOf = (from: number, to: number): "days" | "months" | "years" => {
  const days = (to - from) / 86_400;
  if (days > 1_200) {
    return "years";
  }
  return days > 90 ? "months" : "days";
};
