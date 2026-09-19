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
 * A euro figure for an axis. With privacy on there is **none**, with no
 * exception and no "it is only an axis": twelve units of a fund with a public
 * price give the amount away just as well as the amount. Not even the mask:
 * four dots on every line of the grid would say nothing and add noise, and the
 * shape of the lines is what stays useful in public.
 */
export const axisAmount = (value: number | null | undefined, privacy: boolean): string => {
  if (privacy || value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }
  return compact(value);
};

/**
 * A date of the X axis: the day is noise on a five-year range, and vital on a
 * month. The year in full: «feb 27» reads as the 27th of February.
 */
export const axisDate = (timestamp: number, span: "days" | "months" | "years"): string => {
  const date = new Date(timestamp * 1000);
  const month = date.toLocaleDateString("es-ES", { month: "short", timeZone: "UTC" });
  if (span === "years") {
    return String(date.getUTCFullYear());
  }
  if (span === "months") {
    return `${month} ${date.getUTCFullYear()}`;
  }
  return `${date.getUTCDate()} ${month}`;
};

/**
 * The labels of the date axis, each said **once**: uPlot places its ticks by
 * the room it has, not by the calendar, so four months across a wide screen
 * got a tick every few days and "sept 26" written six times in a row. A tick
 * whose label repeats the one before it stays unlabelled.
 */
export const axisDates = (
  splits: readonly number[],
  span: "days" | "months" | "years",
): string[] => {
  const labels = splits.map((value) => axisDate(value, span));
  return labels.map((label, index) => (index > 0 && labels[index - 1] === label ? "" : label));
};

/** Which of the three date spans a range of seconds deserves. */
export const spanOf = (from: number, to: number): "days" | "months" | "years" => {
  const days = (to - from) / 86_400;
  if (days > 1_200) {
    return "years";
  }
  return days > 90 ? "months" : "days";
};
