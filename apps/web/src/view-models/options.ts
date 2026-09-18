// The lists a form chooses from. No identifier is ever typed by hand when it
// can be picked (FR-046), and the lists come from the catalogue of the ledger,
// so they cannot drift from what exists.

import {
  accounts,
  assets,
  type Book,
  type CivilDate,
  type LedgerState,
  pendingOrders,
  physicalPositions,
  settingsAt,
  theses,
  transferWatch,
} from "@atlas/domain";
import type { Option } from "../components/Field.jsx";
import { formatDate } from "../format/date.js";
import { eventLabel, platformLabel, valueLabel } from "../format/labels.js";
import { displayName, nameIndex } from "../format/names.js";
import { countOf } from "../format/number.js";
import type { FieldSpec, OptionSource } from "./forms/specs.js";

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

export const accountOptions = (
  state: LedgerState,
  book?: Book,
  { inactive = false }: { inactive?: boolean } = {},
): Option[] =>
  accounts(state)
    .filter(
      (account) => (inactive || account.active) && (book === undefined || account.book === book),
    )
    .map((account) => ({
      value: account.account_id,
      label: account.name,
      hint: `${platformLabel(account.platform)} · ${valueLabel(account.book)}${
        account.active ? "" : " · cerrada"
      }`,
    }));

export interface AssetChoice {
  /** Only this book: a core account never buys a bucket share, and a thesis never covers a fund. */
  book?: Book | undefined;
  /**
   * Inactive assets holding a position are offered too: in this account, or in
   * any account with `true`. Absent, no inactive asset is offered.
   */
  heldIn?: string | true | undefined;
  /** Every inactive asset, held or not: a filter of the ledger has to reach the past. */
  inactive?: boolean;
}

/**
 * The assets a form can choose from: the active ones first, then the inactive
 * ones that still hold a position, marked as such, and never an inactive one
 * with nothing left.
 *
 * The inactive-with-position case is not a corner: a delisted share is
 * deactivated and **still held**, so the summary asks for its valuation — and
 * the valuation form used to hide it because it only listed active assets. The
 * total stayed partial for ever, with a button that led nowhere.
 */
export const assetOptions = (state: LedgerState, choice: AssetChoice = {}): Option[] => {
  const held = new Set(
    choice.heldIn === undefined
      ? []
      : physicalPositions(state)
          .filter((row) => choice.heldIn === true || row.account_id === choice.heldIn)
          .map((row) => row.asset_id),
  );
  const inBook = assets(state).filter(
    (asset) => choice.book === undefined || asset.book === choice.book,
  );
  const option = (asset: (typeof inBook)[number]): Option => ({
    value: asset.asset_id,
    label: asset.name,
    hint: `${valueLabel(asset.asset_type)} · ${asset.currency}${asset.active ? "" : " · dado de baja"}`,
  });
  return [
    ...inBook.filter((asset) => asset.active).map(option),
    ...inBook
      .filter((asset) => !asset.active && (choice.inactive === true || held.has(asset.asset_id)))
      .map(option),
  ];
};

/**
 * The book the chosen account or asset of another field belongs to, when the
 * field says where to look (`bookFrom`). Nothing chosen yet means no filter.
 */
export const bookOf = (state: LedgerState, id: string | undefined): Book | undefined =>
  id === undefined || id === ""
    ? undefined
    : (state.accounts.get(id)?.book ?? state.assets.get(id)?.book);

/**
 * How long something has been open, as a hint. **Never a negative number**: a
 * form is filled against the whole ledger, which can hold an event dated ahead
 * of today (a purchase with next week's value date is normal), and "-780 días"
 * is not an age, it is a subtraction shown by mistake.
 */
const ageHint = (days: number): string => (days < 0 ? "con fecha futura" : `${days} días`);

/** Open orders, so a purchase can close the one it executes. */
export const openOrderOptions = (state: LedgerState, at: CivilDate): Option[] => {
  const names = nameIndex(state);
  return pendingOrders(state, at).map((order) => ({
    value: order.order_id,
    label: `${eventLabel(order.side === "buy" ? "buy" : "sell")} de ${displayName(names, order.asset_id)}`,
    hint: `${order.requested_date} · ${displayName(names, order.account_id)} · ${ageHint(order.days_open)}`,
  }));
};

/** Open transfer requests, so the accounting transfer can close the one it completes. */
export const openTransferOptions = (state: LedgerState, at: CivilDate): Option[] => {
  const names = nameIndex(state);
  return transferWatch(state, at, settingsAt(state, at).settings).rows.map((request) => ({
    value: request.request_id,
    label: `${displayName(names, request.from_asset_id)} → ${displayName(names, request.to_asset_id)}`,
    hint: `${request.requested_date} · ${request.stage} · ${ageHint(request.days_open)}${
      request.overdue === true ? " ⚠ fuera de plazo" : ""
    }`,
  }));
};

/**
 * Open theses of that (account, asset). A bucket purchase demands one (rule 15),
 * and since feature 007 the form that creates one lives in the web too.
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
      label: `${displayName(names, thesis.asset_id)} · ${displayName(names, thesis.account_id)}`,
      hint: `abierta el ${formatDate(thesis.opened_at)}, hace ${countOf(thesis.days_open, "día", "días")}`,
    }));
};

export interface OptionContext {
  state: LedgerState;
  date: CivilDate;
  /** Current values, so the thesis list can narrow down to the chosen pair. */
  values: Record<string, string>;
}

/** The list a field asks for, resolved against the ledger. */
export const optionsFor = (
  source: OptionSource,
  context: OptionContext,
  field?: Pick<FieldSpec, "bookFrom" | "heldFrom" | "heldAnywhere">,
): Option[] => {
  switch (source) {
    case "accounts":
      return accountOptions(context.state);
    case "bucketAccounts":
      return accountOptions(context.state, "bucket");
    case "assets":
      return assetOptions(context.state, {
        book: bookOf(context.state, field?.bookFrom && context.values[field.bookFrom]),
        heldIn:
          field?.heldFrom !== undefined
            ? context.values[field.heldFrom] || true
            : field?.heldAnywhere === true
              ? true
              : undefined,
      });
    case "bucketAssets":
      return assetOptions(context.state, { book: "bucket" });
    case "currencies":
      return currencyOptions(context.state);
    case "openOrders":
      return openOrderOptions(context.state, context.date);
    case "openTransfers":
      return openTransferOptions(context.state, context.date);
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
