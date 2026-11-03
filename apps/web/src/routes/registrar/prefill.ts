// What «Repetir la compra del mes» carries to the form of a purchase in the address
// (`?cuenta=&activo=&importe=`, docs/design/system.md §7.4): checked against the ledger before it
// fills anything, because an address is typed, shared and kept in the history.

import type { LedgerState } from "@atlas/domain";
import { today } from "../../ledger/state.js";
import { selectOptions } from "../../view-models/forms/choices.js";
import type { EventFormSpec, FormValues } from "../../view-models/forms/index.js";
import { withDerived } from "./FormFields.jsx";

/**
 * The values of a new purchase with what the application proposes (`?cuenta=&activo=&importe=`),
 * derived fields included. Only on a purchase, and only what the ledger knows: an account or an
 * asset that does not exist, or an asset the account does not hold, is dropped; the amount is the
 * plan's, in euros, so it is kept only on a form in euros and only when it reads as an amount.
 */
export const withPrefill = (
  spec: EventFormSpec,
  state: LedgerState,
  base: FormValues,
  prefill: FormValues,
): FormValues => {
  if (spec.type !== "buy") {
    return base;
  }
  let values = base;
  const account = prefill.account_id;
  if (account !== undefined && state.accounts.has(account)) {
    values = withDerived(spec.fields, state, values, "account_id", account);
    const asset = prefill.asset_id;
    const field = spec.fields.find((one) => one.name === "asset_id");
    const allowed =
      field !== undefined &&
      selectOptions(field, state, values, today()).some((option) => option.value === asset);
    if (asset !== undefined && allowed) {
      values = withDerived(spec.fields, state, values, "asset_id", asset);
    }
  }
  const amount = prefill.amount;
  if (amount !== undefined && /^\d+(\.\d{1,2})?$/.test(amount) && values.currency === "EUR") {
    values = { ...values, amount };
  }
  return values;
};
