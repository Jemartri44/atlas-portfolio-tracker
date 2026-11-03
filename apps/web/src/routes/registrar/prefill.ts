// What «Repetir la compra del mes» fills in the form of a purchase (docs/design/system.md §7.4):
// the account and the asset from the address (`?cuenta=&activo=&repetir=1`), checked against the
// ledger because an address is typed, shared and kept in the history; the amount from the plan of
// the month, asked again here so that no figure of the portfolio travels in the address.

import type { CivilDate, LedgerEvent, LedgerState } from "@atlas/domain";
import { today } from "../../ledger/state.js";
import { selectOptions } from "../../view-models/forms/choices.js";
import type { EventFormSpec, FormValues } from "../../view-models/forms/index.js";
import { withDerived } from "./FormFields.jsx";

/**
 * The values of a new purchase with what the application proposes, derived fields included. Only on a purchase, and only what the ledger knows: an account or an
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

/** What the plan of the month proposes for an asset still to buy, in euros; nothing otherwise. */
export const proposedAmount = async (
  events: readonly LedgerEvent[],
  asset: string,
  date: CivilDate,
): Promise<string | undefined> => {
  try {
    const { monthPlan } = await import("@atlas/domain/portfolio");
    const plan = monthPlan(events, date);
    const row =
      plan.status === "ready"
        ? plan.assets.find((one) => one.asset_id === asset && one.done_on === undefined)
        : undefined;
    return row?.proposed_eur.amount.toString();
  } catch {
    return undefined;
  }
};
