// The speculative bucket (specification §6.2, business rules 13-20): what is
// open, how it is doing, and how it compares with the boring alternative.
//
// Only the `bucket` book (constitution III). Everything here is informative: it
// reads lots, gains and theses, and writes nothing into them. It is also the
// reason the index comparison lives here and not inside `theses.ts`: pass B of
// the projection uses that module, and the path that creates lots and gains
// must never learn what a price is (constitution II).

import { type CivilDate, daysBetween } from "../dates/civil-date.js";
import { Decimal } from "../money/decimal.js";
import { Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import type { AccountId, AssetId } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { type ExternalPrices, type PriceLookup, positionValueOf, priceAt } from "./prices.js";
import type { LedgerState, Thesis, Warning } from "./state.js";
import { openThesisOn } from "./theses.js";

const EUR = "EUR";
const HUNDRED = Decimal.parse("100");

export interface BucketPosition {
  account_id: AccountId;
  asset_id: AssetId;
  quantity: Quantity;
  /** Average cost of the open lots of the asset; absent when there are none. */
  unit_cost_eur?: Money;
  /** `unit_cost × quantity`. */
  cost_eur?: Money;
  /** Absent = "no price": never a zero (constitution V). */
  price?: PriceLookup;
  value_eur?: Money;
  /** `value − cost`, the latent gain. */
  unrealized_eur?: Money;
  /** Over the cost; absent when the cost is zero. */
  unrealized_pct?: Decimal;
  /** The thesis open on this (account, asset), if any. */
  thesis_id?: string;
  days_open?: number;
  expected_horizon_days?: number;
  horizon_exceeded?: boolean;
  /** Shown in full: a condition written once and never re-read is worth nothing. */
  invalidation?: string;
}

export interface BucketPositions {
  date: CivilDate;
  rows: BucketPosition[];
  /** Sum of what does have a price; labelled partial when something is missing. */
  total_value_eur: Money;
  total_cost_eur: Money;
  partial: boolean;
  missing_prices: AssetId[];
  stale_prices: AssetId[];
  warnings: Warning[];
}

export const warn = (
  warnings: Warning[],
  code: string,
  message: string,
  details: Record<string, unknown>,
  eventId = "",
): void => {
  warnings.push({ code, event_id: eventId, message, details });
};

/** Ids of the accounts of the bucket book. */
export const bucketAccountIds = (state: LedgerState): Set<string> => {
  const ids = new Set<string>();
  for (const [accountId, account] of state.accounts) {
    if (account.book === "bucket") {
      ids.add(accountId);
    }
  }
  return ids;
};

/**
 * Average cost per unit of the open lots of an asset. The lots are global per
 * asset (ADR-0009) and rule 21 keeps an asset out of both books, so inside the
 * bucket this is the cost of the account; with the same asset in two bucket
 * accounts (allowed, with a warning, since feature 001) each row takes its
 * share of the same average.
 */
export const openUnitCostOf = (state: LedgerState, assetId: AssetId): Money | undefined => {
  let cost = Money.zero(EUR);
  let quantity = Quantity.ZERO;
  for (const lot of state.lots.get(assetId)?.open ?? []) {
    cost = cost.add(lot.cost_eur);
    quantity = quantity.add(lot.quantity);
  }
  // A position with no open lots behind it is a ledger `integrity` already
  // reports as `lots_mismatch`. The view says "no cost" instead of dividing by
  // zero or inventing one.
  return quantity.isPositive() ? cost.div(quantity.value) : undefined;
};

/** Latent gain of a quantity at a price, given the average cost; nothing without both. */
const unrealizedOf = (
  value: Money | undefined,
  cost: Money | undefined,
): { unrealized_eur?: Money; unrealized_pct?: Decimal } => {
  if (value === undefined || cost === undefined) {
    return {};
  }
  const unrealized = value.sub(cost);
  return {
    unrealized_eur: unrealized,
    ...(cost.isZero() ? {} : { unrealized_pct: unrealized.amount.div(cost.amount).mul(HUNDRED) }),
  };
};

/** The thesis part of a row: the open thesis of that pair, with its clock running. */
const thesisPartOf = (thesis: Thesis | undefined, date: CivilDate): Partial<BucketPosition> => {
  if (thesis === undefined) {
    return {};
  }
  const daysOpen = daysBetween(thesis.opened_at, date);
  return {
    thesis_id: thesis.thesis_id,
    days_open: daysOpen,
    expected_horizon_days: thesis.expected_horizon_days,
    horizon_exceeded: daysOpen > thesis.expected_horizon_days,
    invalidation: thesis.invalidation,
  };
};

/** Open positions of the bucket at a date, with their latent P&L and their thesis (§3.2). */
export const bucketPositions = (
  state: LedgerState,
  date: CivilDate,
  settings: Settings,
  external?: ExternalPrices,
): BucketPositions => {
  const accounts = bucketAccountIds(state);
  const warnings: Warning[] = [];
  const missing: AssetId[] = [];
  const stale: AssetId[] = [];
  const rows: BucketPosition[] = [];
  let value = Money.zero(EUR);
  let cost = Money.zero(EUR);

  for (const [key, quantity] of state.positions) {
    const [accountId, assetId] = key.split("|") as [AccountId, AssetId];
    if (!accounts.has(accountId) || !quantity.isPositive()) {
      continue;
    }
    const price = priceAt(state, assetId, date, settings, external);
    const unitCost = openUnitCostOf(state, assetId);
    const rowCost = unitCost === undefined ? undefined : unitCost.mul(quantity.value);
    const rowValue = positionValueOf(price, quantity);
    if (rowValue === undefined) {
      missing.push(assetId);
    } else {
      value = value.add(rowValue);
    }
    if (rowCost !== undefined) {
      cost = cost.add(rowCost);
    }
    if (price?.stale === true) {
      stale.push(assetId);
      warn(
        warnings,
        "stale_price",
        `${assetId}: price is ${price.age_days} days old (limit ${settings.stale_price_days})`,
        { asset_id: assetId, age_days: price.age_days, date: price.date },
        price.event_id,
      );
    }
    rows.push({
      account_id: accountId,
      asset_id: assetId,
      quantity,
      ...(unitCost === undefined ? {} : { unit_cost_eur: unitCost }),
      ...(rowCost === undefined ? {} : { cost_eur: rowCost }),
      ...(price === undefined ? {} : { price }),
      ...(rowValue === undefined ? {} : { value_eur: rowValue }),
      ...unrealizedOf(rowValue, rowCost),
      ...thesisPartOf(openThesisOn(state, accountId, assetId), date),
    });
  }

  rows.sort((a, b) =>
    a.account_id === b.account_id
      ? a.asset_id.localeCompare(b.asset_id)
      : a.account_id.localeCompare(b.account_id),
  );
  const partial = missing.length > 0;
  if (partial) {
    warn(
      warnings,
      "partial_bucket_total",
      `no price for ${missing.join(", ")} at ${date}: the bucket total covers only what is priced`,
      { assets: missing, date },
    );
  }
  return {
    date,
    rows,
    total_value_eur: value,
    total_cost_eur: cost,
    partial,
    missing_prices: missing,
    stale_prices: stale,
    warnings,
  };
};
