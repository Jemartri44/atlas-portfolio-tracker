// The core's return after the tax it causes, as the Cartera shows it beside the one before (never
// instead). Plain data from `coreXirrAfterTax` (criterion #29): no arithmetic of money here.

import type { Money } from "@atlas/domain";
import type { CoreXirrAfterTax } from "@atlas/domain/fiscal";

export interface AfterTaxView {
  xirrPct?: string;
  /** The core's estimated tax of every closed year, added up. */
  tax?: Money;
  /** Why there is no figure. */
  gap?: string;
  /** The year that has not closed yet: its tax is not in the figure. */
  openYear?: number;
}

const GAPS: Partial<Record<NonNullable<CoreXirrAfterTax["gap"]>, string>> = {
  invalid: "hay movimientos con errores: corrígelos y saldrá",
  no_rate: "los movimientos no dan una rentabilidad anual",
};

/** None when the rate before has no figure: the line above already says why. */
export const afterTaxView = (result: CoreXirrAfterTax, to: string): AfterTaxView | undefined => {
  if (result.gap === "before") {
    return undefined;
  }
  const year = Number(to.slice(0, 4));
  const unsupported = result.years.filter((entry) => entry.gap !== undefined).map((e) => e.year);
  const gap =
    result.gap === "year"
      ? `no se calcula el impuesto de ${unsupported.join(", ")}: Atlas lo hace desde 2018`
      : result.gap === undefined
        ? undefined
        : GAPS[result.gap];
  return {
    ...(result.xirr_pct === undefined ? {} : { xirrPct: result.xirr_pct.toString() }),
    ...(result.tax_eur === undefined ? {} : { tax: result.tax_eur }),
    ...(gap === undefined ? {} : { gap }),
    ...(to.endsWith("-12-31") ? {} : { openYear: year }),
  };
};
