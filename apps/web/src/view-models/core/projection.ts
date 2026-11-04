// The projection as the screen shows it: the result of `projectionCases` as plain data.

import { addYears, type Money } from "@atlas/domain";
import type { ProjectionCases, ProjectionDiscounts } from "@atlas/domain/portfolio";
import { formatDecimalString } from "../../format/number.js";
import { numberOrNull, secondsOf, stringOrUndefined } from "../series.js";

const GAPS: Record<string, string> = {
  partial: "falta un precio de la cartera principal",
  no_targets: "no hay pesos objetivo en Configuración",
  targets_not_100: "los pesos objetivo no suman 100",
  missing_settings: "falta la aportación mensual en Configuración",
};

/** What the card draws: the band, the normal case and what was contributed. */
export interface ProjectionPlot {
  /** Seconds since the epoch of each year of the horizon, counted from the date asked about. */
  x: number[];
  low: (number | null)[];
  normal: (number | null)[];
  high: (number | null)[];
  contributed: (number | null)[];
  /** Rows of the equivalent table: pessimistic, normal, optimistic and contributed. */
  rows: { date: string; values: (string | undefined)[] }[];
}

export interface ProjectionCaseView {
  label: string;
  value: Money;
  fees: Money;
  tax: Money;
}

export interface ProjectionView {
  /** Why there is no figure, when there is none. */
  gap?: string;
  years: number;
  start?: Money;
  cases: ProjectionCaseView[];
  /** The sentence of what the figures have discounted. */
  discounted: string;
  /** Part of the core declares no TER: the TER does not reach it. */
  terMissing?: Money;
  plot?: ProjectionPlot;
}

const listed = (parts: readonly string[]): string =>
  parts.length < 2
    ? (parts[0] as string)
    : `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;

const discountedSentence = (result: ProjectionCases, discounts: ProjectionDiscounts): string => {
  const ter =
    result.ter_pct === undefined
      ? undefined
      : `TER ${formatDecimalString(result.ter_pct.toString(), { decimals: 2 })} %`;
  const commission = result.missing.includes("commission") ? undefined : "comisión de aportación";
  const fees = [ter, commission].filter((part) => part !== undefined);
  const parts = [
    ...(discounts.inflation ? ["inflación"] : []),
    ...(discounts.taxes ? ["impuestos al vender (escala del ahorro)"] : []),
    ...(discounts.fees && fees.length > 0 ? [fees.join(" más ")] : []),
  ];
  return parts.length === 0
    ? "Sin descontar nada."
    : `Descontado: ${listed(parts)}. Es una estimación informativa.`;
};

const plotOf = (result: ProjectionCases, asOf: string): ProjectionPlot => {
  const dates = result.points.map((point) => addYears(asOf, point.year));
  return {
    x: dates.map((date) => secondsOf(date)),
    low: result.points.map((point) => numberOrNull(point.low_eur)),
    normal: result.points.map((point) => numberOrNull(point.normal_eur)),
    high: result.points.map((point) => numberOrNull(point.high_eur)),
    contributed: result.points.map((point) => numberOrNull(point.contributed_eur)),
    rows: result.points.map((point, at) => ({
      date: dates[at] as string,
      values: [point.low_eur, point.normal_eur, point.high_eur, point.contributed_eur].map(
        stringOrUndefined,
      ),
    })),
  };
};

export const projectionView = (
  result: ProjectionCases,
  asOf: string,
  discounts: ProjectionDiscounts,
): ProjectionView => {
  const base = {
    years: result.years,
    cases: [],
    discounted: "",
    ...(result.start_eur === undefined ? {} : { start: result.start_eur }),
  };
  if (result.gap !== undefined || result.ends === undefined) {
    return { ...base, gap: GAPS[result.gap as string] ?? "faltan datos" };
  }
  const { low, normal, high } = result.ends;
  const caseOf = (label: string, end: typeof low): ProjectionCaseView => ({
    label,
    value: end.value_eur,
    fees: end.fees_eur,
    tax: end.tax_eur,
  });
  return {
    ...base,
    cases: [caseOf("Pesimista", low), caseOf("Normal", normal), caseOf("Optimista", high)],
    discounted: discountedSentence(result, discounts),
    ...(result.ter_partial ? { terMissing: result.ter_missing_eur } : {}),
    plot: plotOf(result, asOf),
  };
};
