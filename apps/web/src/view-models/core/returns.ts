// What the core has earned, as the Cartera shows it: «he aportado X, vale Y, he ganado Z %», the
// money-weighted annual rate (and the real one, discounting the CPI) and the same by asset class.
// Plain data from `coreXirr` and `classReturns`: no arithmetic of money here. A figure whose data is
// missing (a price, the CPI of a year) is not shown: the sentence says what is missing.

import type { Money } from "@atlas/domain";
import type {
  ClassReturnGap,
  ClassReturns,
  CoreXirr,
  CoreXirrGap,
  UnsupportedEvent,
} from "@atlas/domain/charts";
import { formatDate } from "../../format/date.js";
import { valueLabel } from "../../format/labels.js";
import { displayNames, type NameIndex } from "../../format/names.js";

const GAPS: Record<CoreXirrGap, string> = {
  partial: "falta un precio de la cartera principal",
  uncovered_buys: "hay compras de las que no consta el ingreso",
  no_flows: "todavía no has aportado nada a la cartera principal",
  no_rate: "los movimientos no dan una rentabilidad anual",
};

const CLASS_GAPS: Record<ClassReturnGap, string> = {
  partial: "falta un precio",
  no_flows: "sin compras",
  unsupported_events: "hay operaciones que no se leen",
  no_rate: "sin rentabilidad anual",
};

/** What the owner can do or understand about each event the class return does not read. */
const reasonOf = (item: UnsupportedEvent, names: NameIndex): string => {
  const date = formatDate(item.date);
  const assets = displayNames(names, item.asset_ids);
  switch (item.reason) {
    case "transfer_without_nav":
      return `falta el valor del traspaso de ${assets} del ${date}: añade el valor liquidativo al traspaso o una valoración de ese día`;
    case "corporate_action_reclassifies":
      return `la operación corporativa de ${assets} del ${date} cambia de clase de activo o de libro y todavía no se calcula`;
    case "corporate_action_grant":
      return `la entrega de unidades de ${assets} del ${date} no trae un precio y todavía no se calcula`;
    case "asset_reclassified":
      return `${assets} cambió de clase o de libro (registrado el ${date}) y todavía no se calcula`;
  }
};

const gapOf = (row: ClassReturns["classes"][number]): string | undefined =>
  row.gap === undefined ? undefined : CLASS_GAPS[row.gap];

export interface RealView {
  xirrPct?: string;
  /** What was earned up to the date the real figures are measured at, in euros of that date. */
  gain?: Money;
  /** Why a figure is missing, or that it stops before the date: always said. */
  note?: string;
}

export interface ClassReturnRowView {
  assetClass: string;
  label: string;
  invested?: Money;
  /** Sold and received as dividends. */
  returned?: Money;
  value?: Money;
  gainPct?: string;
  xirrPct?: string;
  /** Why a figure is missing. */
  gap?: string;
  /** One sentence per event of the class that is not read: which, when, on what, and what to do. */
  reasons?: string[];
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
  const years = real.missing_years.join(", ");
  if (real.until === undefined) {
    return { note: `falta el IPC de ${years}: sin él no hay cifra real` };
  }
  if (real.gap === "partial") {
    return { note: "falta un precio a la fecha del IPC" };
  }
  const notes = [
    ...(real.until < xirr.to
      ? [
          `medida hasta el ${formatDate(real.until)}: falta el IPC de ${years}, que se conoce al terminar el año`,
        ]
      : []),
    ...(real.xirr_pct === undefined ? ["los movimientos no dan una rentabilidad anual real"] : []),
  ];
  return {
    ...(real.xirr_pct === undefined ? {} : { xirrPct: real.xirr_pct.toString() }),
    ...(real.gain_eur === undefined ? {} : { gain: real.gain_eur }),
    ...(notes.length === 0 ? {} : { note: notes.join("; ") }),
  };
};

export const returnsView = (
  xirr: CoreXirr,
  classes: ClassReturns,
  names: NameIndex,
): ReturnsView => {
  const real = realOf(xirr);
  return {
    ...(xirr.gap === undefined ? {} : { gap: GAPS[xirr.gap] }),
    ...(xirr.from === undefined ? {} : { from: xirr.from }),
    ...(xirr.contributed_eur === undefined ? {} : { contributed: xirr.contributed_eur }),
    ...(xirr.value_eur === undefined ? {} : { value: xirr.value_eur }),
    ...(xirr.gain_eur === undefined ? {} : { gain: xirr.gain_eur }),
    ...(xirr.gain_pct === undefined ? {} : { gainPct: xirr.gain_pct.toString() }),
    ...(xirr.xirr_pct === undefined ? {} : { xirrPct: xirr.xirr_pct.toString() }),
    ...(real === undefined ? {} : { real }),
    classes: classes.classes.map((row) => {
      const gap = gapOf(row);
      return {
        assetClass: row.asset_class,
        label: valueLabel(row.asset_class),
        ...(row.invested_eur === undefined ? {} : { invested: row.invested_eur }),
        ...(row.returned_eur === undefined ? {} : { returned: row.returned_eur }),
        ...(row.value_eur === undefined ? {} : { value: row.value_eur }),
        ...(row.gain_pct === undefined ? {} : { gainPct: row.gain_pct.toString() }),
        ...(row.xirr_pct === undefined ? {} : { xirrPct: row.xirr_pct.toString() }),
        ...(gap === undefined ? {} : { gap }),
        ...(row.unsupported.length === 0
          ? {}
          : { reasons: row.unsupported.map((item) => reasonOf(item, names)) }),
      };
    }),
  };
};
