// The unit written inside a numeric field of a form (docs/design/system.md
// §5.10): the currency of an amount, what a quantity counts, the percent of a
// share. The label says what the figure is and the field says in what, the way
// a figure is always shown with its unit and never bare.

import { currencyUnit } from "../../format/currency.js";
import { type NameIndex, unitsOf } from "../../format/names.js";
import type { FieldSpec } from "./specs.js";
import type { FormValues } from "./values.js";

/** Decimals that are a ratio, not a figure with a unit: a rate of the ECB, a share, a TER. */
const UNITLESS = new Set(["fx_rate", "cash_fx_rate", "cost_share", "ter"]);

/** The asset each quantity counts: the one it leaves, the one it enters, or the event's. */
const assetOf = (name: string, values: FormValues): string | undefined => {
  const pick =
    name === "quantity_out"
      ? values.from_asset_id || values.asset_id
      : name === "quantity_in"
        ? values.to_asset_id || values.asset_id
        : values.asset_id;
  return pick === undefined || pick === "" ? undefined : pick;
};

/** The currency an amount field is in: its own pair's, the fee's, or the event's. */
const currencyOf = (name: string, values: FormValues): string => {
  const own: Record<string, string | undefined> = {
    sold_amount: values.sold_currency,
    bought_amount: values.bought_currency,
    cash_unit_price: values.cash_currency,
    fee: values.fee_currency || values.currency,
  };
  const chosen = name.endsWith("_eur") ? "EUR" : name in own ? own[name] : values.currency;
  // An order is placed in euros, and a form with no currency asked is in euros.
  return chosen === undefined || chosen === "" ? "EUR" : chosen;
};

export const fieldUnit = (
  field: FieldSpec,
  values: FormValues,
  names: NameIndex,
): string | undefined => {
  if (field.kind !== "decimal" && field.kind !== "integer") {
    return undefined;
  }
  if (field.name.endsWith("_pct")) {
    return "%";
  }
  if (field.name.endsWith("_pp")) {
    return "pp";
  }
  if (field.kind === "integer" || UNITLESS.has(field.name)) {
    return undefined;
  }
  if (/^quantity(_in|_out)?$/.test(field.name)) {
    const asset = assetOf(field.name, values);
    return asset === undefined ? undefined : unitsOf(names, asset);
  }
  return currencyUnit(currencyOf(field.name, values));
};
