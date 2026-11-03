// What the core costs over the years as the screen shows it: the assumptions typed, read for
// `totalCost`, and its result as plain data.

import type { Decimal, Money } from "@atlas/domain";
import type { TotalCost, TotalCostAssumptions } from "@atlas/domain/portfolio";
import { parseIntegerInput } from "../../format/input.js";
import { DEFAULT_YEARS, decimalOf, GAPS, missingSentence } from "./long-run.js";

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
  const years = parseIntegerInput(inputs.years);
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
      years: Number(years.value),
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

export const totalCostView = (result: TotalCost): TotalCostView => ({
  years: result.years,
  ...(result.gap === undefined ? {} : { gap: GAPS[result.gap] ?? result.gap }),
  ...(missingSentence(result.missing) === undefined
    ? {}
    : { missing: missingSentence(result.missing) as string }),
  ...(result.ter_partial ? { terMissing: result.ter_missing_eur } : {}),
  ...(result.end_without_costs_eur === undefined
    ? {}
    : { withoutCosts: result.end_without_costs_eur }),
  ...(result.end_net_eur === undefined ? {} : { net: result.end_net_eur }),
  ...(result.ter_cost_eur === undefined ? {} : { ter: result.ter_cost_eur }),
  ...(result.commission_cost_eur === undefined ? {} : { commission: result.commission_cost_eur }),
  ...(result.exit_tax_eur === undefined ? {} : { exitTax: result.exit_tax_eur }),
  ...(result.total_eur === undefined ? {} : { total: result.total_eur }),
});
