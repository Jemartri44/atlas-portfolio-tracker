// What the core costs over the years as the screen shows it: the assumptions typed, read for
// `totalCost`, and its result as plain data.

import type { Decimal, Money } from "@atlas/domain";
import type { TotalCost, TotalCostAssumptions } from "@atlas/domain/portfolio";
import {
  CONTRIBUTION_KEYS,
  DEFAULT_YEARS,
  decimalOf,
  GAPS,
  missingPhrase,
  missingSentence,
  yearsOf,
} from "./long-run.js";

export interface CostInputs {
  years: string;
  grossReturn: string;
  commission: string;
  exitTax: string;
}

export const emptyCostInputs = (): CostInputs => ({
  years: DEFAULT_YEARS,
  grossReturn: "",
  commission: "",
  exitTax: "",
});

export interface ReadCost {
  assumptions?: TotalCostAssumptions;
  errors: Partial<Record<keyof CostInputs, string>>;
}

export const readCost = (inputs: CostInputs): ReadCost => {
  const errors: ReadCost["errors"] = {};
  const years = yearsOf(inputs.years);
  if (!years.ok) {
    errors.years = years.message;
  }
  const optional = (key: "commission" | "exitTax"): Decimal | undefined => {
    if (inputs[key].trim() === "") {
      return undefined;
    }
    const read = decimalOf(inputs[key]);
    if (!read.ok) {
      errors[key] = read.message;
      return undefined;
    }
    if (read.value.isNegative()) {
      errors[key] = "No puede ser negativo.";
      return undefined;
    }
    return read.value;
  };
  const commission = optional("commission");
  const exitTax = optional("exitTax");
  let gross: Decimal | undefined;
  if (inputs.grossReturn.trim() !== "") {
    const read = decimalOf(inputs.grossReturn);
    if (read.ok) {
      gross = read.value;
    } else {
      errors.grossReturn = read.message;
    }
  }
  if (!years.ok || gross === undefined || Object.keys(errors).length > 0) {
    return { errors };
  }
  return {
    errors,
    assumptions: {
      years: years.value,
      grossReturnPct: gross,
      ...(commission === undefined ? {} : { commissionPct: commission }),
      ...(exitTax === undefined ? {} : { exitTaxPct: exitTax }),
    },
  };
};

export interface TotalCostView {
  gap?: string;
  missing?: string;
  /** Part of the priced value has no TER: it is left out, and how much. */
  terMissing?: Money;
  years: number;
  withoutCosts?: Money;
  net?: Money;
  ter?: Money;
  commission?: Money;
  exitTax?: Money;
  total?: Money;
}

export const totalCostView = (result: TotalCost): TotalCostView => {
  // Without the contribution the figures count it as zero: nothing is shown, and what is missing is said.
  const blocking = result.missing.filter((key) => CONTRIBUTION_KEYS.includes(key));
  const reasons = [
    ...(result.gap === undefined ? [] : [GAPS[result.gap] ?? result.gap]),
    ...(missingPhrase(blocking) === undefined ? [] : [missingPhrase(blocking) as string]),
  ];
  const rest = missingSentence(result.missing.filter((key) => !blocking.includes(key)));
  return {
    years: result.years,
    ...(reasons.length === 0 ? {} : { gap: reasons.join("; ") }),
    ...(rest === undefined ? {} : { missing: rest }),
    ...(result.ter_partial ? { terMissing: result.ter_missing_eur } : {}),
    ...(result.end_without_costs_eur === undefined
      ? {}
      : { withoutCosts: result.end_without_costs_eur }),
    ...(result.end_net_eur === undefined ? {} : { net: result.end_net_eur }),
    ...(result.ter_cost_eur === undefined ? {} : { ter: result.ter_cost_eur }),
    ...(result.commission_cost_eur === undefined ? {} : { commission: result.commission_cost_eur }),
    ...(result.exit_tax_eur === undefined ? {} : { exitTax: result.exit_tax_eur }),
    ...(result.total_eur === undefined ? {} : { total: result.total_eur }),
  };
};
