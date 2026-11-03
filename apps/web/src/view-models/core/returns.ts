// What the core has earned, as the Cartera shows it: «he aportado X, vale Y, he ganado Z %», the
// money-weighted annual rate (and the real one, discounting the CPI) and the same by asset class.
// Plain data from `coreXirr` and `classReturns`: no arithmetic of money here. A figure whose data is
// missing (a price, the CPI of a year) is not shown: the sentence says what is missing.

import type { Money } from "@atlas/domain";
import type { ClassReturnGap, ClassReturns, CoreXirr, CoreXirrGap } from "@atlas/domain/charts";
import { formatDate } from "../../format/date.js";
import { valueLabel } from "../../format/labels.js";

const GAPS: Record<CoreXirrGap, string> = {
  partial: "falta un precio de la cartera principal",
  uncovered_buys: "hay compras de las que no consta el ingreso",
  no_flows: "todavía no has aportado nada a la cartera principal",
  no_rate: "los movimientos no dan una rentabilidad anual",
};

const CLASS_GAPS: Record<ClassReturnGap, string> = {
  partial: "falta un precio",
  no_flows: "sin compras",
  unsupported_events: "hay operaciones que no se calculan",
  no_rate: "sin rentabilidad anual",
};

export interface RealView {
  xirrPct?: string;
  /** Why there is no real rate, or that it stops before the date: always said. */
  note?: string;
}

export interface ClassReturnRowView {
  assetClass: string;
  label: string;
  invested?: Money;
  value?: Money;
  gainPct?: string;
  xirrPct?: string;
  /** Why a figure is missing. */
  gap?: string;
}

export interface ReturnsView {
  /** Why there is no headline figure, when there is none. */
  gap?: string;
  from?: string;
  contributed?: Money;
  value?: Money;
  gain?: Money;
  gainPct?: string;
  xirrPct?: string;
  real?: RealView;
  classes: ClassReturnRowView[];
}

const realOf = (xirr: CoreXirr): RealView | undefined => {
  const real = xirr.real;
  if (real === undefined) {
    return undefined;
  }
  if (real.until === undefined) {
    return {
      note: `falta el IPC de ${real.missing_years.join(", ")}: sin él no hay cifra real`,
    };
  }
  if (real.gap === "partial") {
    return { note: "falta un precio a la fecha del IPC" };
  }
  const note =
    real.until < xirr.to
      ? `medida hasta el ${formatDate(real.until)}: el IPC de un año se conoce al terminar`
      : undefined;
  return {
    ...(real.xirr_pct === undefined ? {} : { xirrPct: real.xirr_pct.toString() }),
    ...(note === undefined ? {} : { note }),
  };
};

export const returnsView = (xirr: CoreXirr, classes: ClassReturns): ReturnsView => ({
  ...(xirr.gap === undefined ? {} : { gap: GAPS[xirr.gap] }),
  ...(xirr.from === undefined ? {} : { from: xirr.from }),
  ...(xirr.contributed_eur === undefined ? {} : { contributed: xirr.contributed_eur }),
  ...(xirr.value_eur === undefined ? {} : { value: xirr.value_eur }),
  ...(xirr.gain_eur === undefined ? {} : { gain: xirr.gain_eur }),
  ...(xirr.gain_pct === undefined ? {} : { gainPct: xirr.gain_pct.toString() }),
  ...(xirr.xirr_pct === undefined ? {} : { xirrPct: xirr.xirr_pct.toString() }),
  ...(realOf(xirr) === undefined ? {} : { real: realOf(xirr) as RealView }),
  classes: classes.classes.map((row) => ({
    assetClass: row.asset_class,
    label: valueLabel(row.asset_class),
    ...(row.invested_eur === undefined ? {} : { invested: row.invested_eur }),
    ...(row.value_eur === undefined ? {} : { value: row.value_eur }),
    ...(row.gain_pct === undefined ? {} : { gainPct: row.gain_pct.toString() }),
    ...(row.xirr_pct === undefined ? {} : { xirrPct: row.xirr_pct.toString() }),
    ...(row.gap === undefined ? {} : { gap: CLASS_GAPS[row.gap] }),
  })),
});
