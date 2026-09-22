// Spanish number formatting **from the decimal string**, never through
// `Number()`: converting to floating point just to paint is the door through
// which the error ADR-0005 closes comes back in. Grouping digits over the
// string is ten lines and it is exact.
//
// This module is not the privacy gate: it formats percentages, weights and
// deviations, which stay visible in public (Q6). Amounts and quantities go
// through `format/money.ts`, which only `components/Amount.tsx` may import.

const GROUP = ".";
const DECIMAL = ",";

/**
 * The space between a figure and its unit (`%`, `pp`, `EUR`): **non-breaking**,
 * as Spanish typography wants, so a line never ends in "12,5" and starts the
 * next one with "%".
 */
export const NBSP = "\u00a0";

export interface NumberFormat {
  /** Exact number of decimals; the column decides, not the value. */
  decimals?: number;
  /** Group thousands with a dot. On by default. */
  grouped?: boolean;
  /** Always show the sign, even when positive: a gain reads as a gain. */
  signed?: boolean;
}

const groupDigits = (digits: string): string => {
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) {
      out += GROUP;
    }
    out += digits.charAt(i);
  }
  return out;
};

/** Rounds a decimal string half-up to `decimals`, without floating point. */
export const roundDecimalString = (value: string, decimals: number): string => {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value.replace(/^\+/, "");
  const [whole = "0", fraction = ""] = unsigned.split(".");
  if (fraction.length <= decimals) {
    const padded = fraction.padEnd(decimals, "0");
    return `${negative ? "-" : ""}${whole}${padded.length > 0 ? `.${padded}` : ""}`;
  }
  const keep = fraction.slice(0, decimals);
  const roundUp = Number.parseInt(fraction.charAt(decimals), 10) >= 5;
  let digits = `${whole}${keep}`;
  if (roundUp) {
    // Increment the integer made of whole+keep, digit by digit.
    const chars = digits.split("");
    let index = chars.length - 1;
    while (index >= 0) {
      if (chars[index] === "9") {
        chars[index] = "0";
        index -= 1;
      } else {
        chars[index] = String(Number.parseInt(chars[index] as string, 10) + 1);
        break;
      }
    }
    digits = (index < 0 ? "1" : "") + chars.join("");
  }
  const cut = decimals === 0 ? digits.length : digits.length - decimals;
  const newWhole = digits.slice(0, cut).replace(/^0+(?=\d)/, "");
  const newFraction = digits.slice(cut);
  return `${negative ? "-" : ""}${newWhole === "" ? "0" : newWhole}${
    newFraction === "" ? "" : `.${newFraction}`
  }`;
};

/** A decimal string as a person reads it: comma decimal, dot thousands. */
export const formatDecimalString = (value: string, format: NumberFormat = {}): string => {
  const rounded =
    format.decimals === undefined ? value : roundDecimalString(value, format.decimals);
  const negative = rounded.startsWith("-");
  const unsigned = negative ? rounded.slice(1) : rounded.replace(/^\+/, "");
  const [whole = "0", fraction] = unsigned.split(".");
  const grouped = format.grouped === false ? whole : groupDigits(whole);
  const body =
    fraction === undefined || fraction === "" ? grouped : `${grouped}${DECIMAL}${fraction}`;
  // A value that rounds to zero is a zero: "−0,00" reads as a tiny loss that
  // is not there, and a minus sign is meaning, not decoration.
  const isZero = /^0(\.0*)?$/.test(unsigned);
  const sign = isZero ? "" : negative ? "−" : format.signed === true ? "+" : "";
  return `${sign}${body}`;
};

/**
 * A quantity of units **from its decimal string**: up to eight decimals with
 * the trailing zeros trimmed, because a fraction of a fund is real and a
 * `12,00000000` is noise.
 *
 * It lives here, and not behind the gate, because the prose of a warning needs
 * exactly this shape and may not import `format/money.ts`. Nothing is given
 * away by it: what the gate owns is the decision to **mask**, taken in
 * `format/privacy.ts` and in `components/Amount.tsx`, never the typography.
 */
export const formatQuantityString = (value: string, decimals = 8): string => {
  const text = formatDecimalString(value, { decimals });
  return text.includes(",") ? text.replace(/,?0+$/, "") : text;
};

/** A percentage, with its symbol and a non-breaking space, as Spanish typography wants. */
export const formatPercent = (value: string | undefined, format: NumberFormat = {}): string =>
  value === undefined ? "sin dato" : `${formatDecimalString(value, { decimals: 2, ...format })} %`;

/** Percentage points: the unit of a deviation from target. */
export const formatPoints = (value: string | undefined, format: NumberFormat = {}): string =>
  value === undefined
    ? "sin dato"
    : `${formatDecimalString(value, { decimals: 2, signed: true, ...format })} pp`;

/**
 * Decimals that say something: none for a whole number ("0 %", "55 %", never
 * "0,0000 %" or "55,00 %"), two for anything two decimals can show, and four
 * for a small figure that two would round to a zero it is not.
 */
export const meaningfulDecimals = (value: string): number => {
  if (/^[+-]?\d*(\.0*)?$/.test(value)) {
    return 0;
  }
  return /^[+-]?0*(\.0*)?$/.test(roundDecimalString(value, 2)) ? 4 : 2;
};

/**
 * A decimal **exactly as recorded**, in Spanish notation: an ECB rate
 * (1,0672), a ratio (1,7), a weight (22,5). Nothing is rounded and nothing is
 * padded, because the point is to read back what was written.
 */
export const formatExact = (value: string): string => formatDecimalString(value);

/** "1 tesis", "2 tesis"; "1 evento", "3 eventos": the noun agrees with the count. */
export const countOf = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** Sign of a decimal string, for the label and the class that accompany the colour. */
export const signOf = (value: string): "positive" | "negative" | "zero" => {
  if (value.startsWith("-")) {
    return /^-0(\.0*)?$/.test(value) ? "zero" : "negative";
  }
  return /^\+?0(\.0*)?$/.test(value) ? "zero" : "positive";
};
