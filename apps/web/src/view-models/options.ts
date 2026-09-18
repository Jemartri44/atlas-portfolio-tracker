// The lists a form chooses from. No identifier is ever typed by hand when it
// can be picked (FR-046), and the lists come from the catalogue of the ledger,
// so they cannot drift from what exists.

import {
  accounts,
  assets,
  type CivilDate,
  type LedgerState,
  pendingOrders,
  theses,
} from "@atlas/domain";
import type { Option } from "../components/Field.jsx";
import { eventLabel, valueLabel } from "../format/labels.js";
import { displayName, nameIndex } from "../format/names.js";
import type { OptionSource } from "./forms/specs.js";

/** Currencies worth offering: the ones the ledger already uses, euro first. */
export const currencyOptions = (state: LedgerState): Option[] => {
  const used = new Set<string>(["EUR"]);
  for (const account of accounts(state)) {
    used.add(account.base_currency);
  }
  for (const asset of assets(state)) {
    used.add(asset.currency);
  }
  return [...used]
    .sort((a, b) => (a === "EUR" ? -1 : b === "EUR" ? 1 : a.localeCompare(b)))
    .map((currency) => ({ value: currency, label: currency }));
};

export const accountOptions = (state: LedgerState, book?: "core" | "bucket"): Option[] =>
  accounts(state)
    .filter((account) => account.active && (book === undefined || account.book === book))
    .map((account) => ({
      value: account.account_id,
      label: account.name,
      hint: `${account.platform} · ${valueLabel(account.book)}`,
    }));

export const assetOptions = (state: LedgerState, book?: "core" | "bucket"): Option[] =>
  assets(state)
    .filter((asset) => asset.active && (book === undefined || asset.book === book))
    .map((asset) => ({
      value: asset.asset_id,
      label: asset.name,
      hint: `${valueLabel(asset.asset_type)} · ${asset.currency}`,
    }));

/** Open orders, so a purchase can close the one it executes. */
export const openOrderOptions = (state: LedgerState, at: CivilDate): Option[] => {
  const names = nameIndex(state);
  return pendingOrders(state, at).map((order) => ({
    value: order.order_id,
    label: `${eventLabel(order.side === "buy" ? "buy" : "sell")} de ${displayName(names, order.asset_id)}`,
    hint: `${order.requested_date} · ${displayName(names, order.account_id)}`,
  }));
};

/**
 * Open theses of that (account, asset). A bucket purchase demands one (rule 15)
 * and the wizard to create them is not in this feature, so the form offers what
 * exists and says how to create one when there is none.
 */
export const openThesisOptions = (
  state: LedgerState,
  at: CivilDate,
  accountId?: string,
  assetId?: string,
): Option[] => {
  const names = nameIndex(state);
  return theses(state, at)
    .filter(
      (thesis) =>
        thesis.status === "open" &&
        (accountId === undefined || thesis.account_id === accountId) &&
        (assetId === undefined || thesis.asset_id === assetId),
    )
    .map((thesis) => ({
      value: thesis.thesis_id,
      label: thesis.thesis_id,
      hint: `${displayName(names, thesis.asset_id)} · ${thesis.days_open} días abierta`,
    }));
};

export interface OptionContext {
  state: LedgerState;
  date: CivilDate;
  /** Current values, so the thesis list can narrow down to the chosen pair. */
  values: Record<string, string>;
}

/** The list a field asks for, resolved against the ledger. */
export const optionsFor = (source: OptionSource, context: OptionContext): Option[] => {
  switch (source) {
    case "accounts":
      return accountOptions(context.state);
    case "bucketAccounts":
      return accountOptions(context.state, "bucket");
    case "assets":
      return assetOptions(context.state);
    case "currencies":
      return currencyOptions(context.state);
    case "openOrders":
      return openOrderOptions(context.state, context.date);
    case "openTheses":
      return openThesisOptions(
        context.state,
        context.date,
        context.values.account_id,
        context.values.asset_id,
      );
    case "books":
      return [
        { value: "core", label: "Núcleo" },
        { value: "bucket", label: "Cubo" },
      ];
    case "assetTypes":
    case "assetClasses":
    case "sides":
      // These come from the schema itself and travel in `values`.
      return [];
    default:
      return [];
  }
};

/** Whether the chosen account belongs to the bucket: a purchase there needs a thesis. */
export const isBucketAccount = (state: LedgerState, accountId: string | undefined): boolean =>
  accountId !== undefined && state.accounts.get(accountId)?.book === "bucket";

/** Currency of an asset or an account, to prefill the field (the domain still validates). */
export const derivedCurrency = (
  state: LedgerState,
  derive: "assetCurrency" | "accountCurrency",
  values: Record<string, string>,
): string | undefined => {
  if (derive === "assetCurrency") {
    const assetId = values.asset_id;
    return assetId === undefined ? undefined : state.assets.get(assetId)?.currency;
  }
  const accountId = values.account_id;
  return accountId === undefined ? undefined : state.accounts.get(accountId)?.base_currency;
};
