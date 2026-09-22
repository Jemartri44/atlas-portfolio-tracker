// Figures that stay visible in public: percentages, weights and deviations
// (Q6). They are the information the user actually consults on the street and
// they do not give the patrimony away, so they are **not** masked — which is
// also why they are not painted by `Amount` and do not touch `format/money.ts`.

import type { JSX } from "solid-js";
import { formatPercent, formatPoints, meaningfulDecimals, signOf } from "../format/number.js";

interface FigureProps {
  /** Decimal string as the domain returns it; `undefined` is "sin dato". */
  value: string | undefined;
  /** `percent` adds " %", `points` adds " pp" and always shows the sign. */
  unit: "percent" | "points" | "plain";
  /**
   * Exact decimals, or `"auto"`: as many as say something — "0 %" for a zero,
   * four for a small ratio two would round away. Never "0,0000 %".
   */
  decimals?: number | "auto" | undefined;
  /** Colour and sign by value; the sign is always printed for points. */
  coloured?: boolean | undefined;
  /** Print the sign of a percentage too: a result reads as a result without colour. */
  signed?: boolean | undefined;
  class?: string | undefined;
}

const NO_DATA = "sin dato";

export const Figure = (props: FigureProps): JSX.Element => {
  const text = (): string => {
    if (props.value === undefined) {
      return NO_DATA;
    }
    const decimals = props.decimals === "auto" ? meaningfulDecimals(props.value) : props.decimals;
    if (props.unit === "percent") {
      return formatPercent(props.value, {
        ...(decimals === undefined ? {} : { decimals }),
        ...(props.signed === true ? { signed: true } : {}),
      });
    }
    if (props.unit === "points") {
      return formatPoints(props.value, decimals === undefined ? {} : { decimals });
    }
    return formatPercent(props.value, { decimals: decimals ?? 0 }).replace(" %", "");
  };

  const sign = (): string =>
    props.coloured === true && props.value !== undefined ? signOf(props.value) : "";

  return (
    <span
      class={`num ${props.value === undefined ? "nodata" : sign()} ${props.class ?? ""}`.trimEnd()}
    >
      {text()}
    </span>
  );
};
