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
import {
  type ExternalPrices,
  type PriceLookup,
  positionValueOf,
  priceAt,
  warnWithoutEur,
} from "./prices.js";
import type { FiscalLot, LedgerState, Thesis, ThesisLeg, ThesisView, Warning } from "./state.js";
import { openThesisOn, theses } from "./theses.js";

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

/** Every lot by id, to walk the lineage of what a sale or a corporate action handed down. */
export const lotIndexOf = (state: LedgerState): Map<string, FiscalLot> => {
  const index = new Map<string, FiscalLot>();
  for (const entry of state.lots.values()) {
    for (const lot of [...entry.open, ...entry.closed]) {
      index.set(lot.id, lot);
    }
  }
  return index;
};

/**
 * The event that originally created a lot, following `source_lot_id` up to the
 * root: a transfer, a swap or a split hands down a lot that somebody else
 * bought, and the lineage is what says who. A `source_lot_id` always names a lot
 * of the same ledger — the projection created it — so the walk always lands.
 */
export const rootEventOf = (lots: Map<string, FiscalLot>, lot: FiscalLot): string => {
  let current = lot;
  while (current.source_lot_id !== undefined) {
    current = lots.get(current.source_lot_id) as FiscalLot;
  }
  return current.source_event_id;
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

/** Why a thesis has no comparison with the index. Never a zero in its place. */
export interface BenchmarkGap {
  reason: "no_benchmark" | "unknown_asset" | "no_price" | "no_linked_buys" | "no_asset_price";
  asset_id?: AssetId;
  date?: CivilDate;
}

export interface BucketThesisView extends ThesisView {
  /** Latent gain of the live position of the pair (account, asset); zero when there is none. */
  unrealized_eur?: Money;
  benchmark_asset_id?: AssetId;
  /** `Σ cost_i × P(d_fin) / P(d_i)`: what the same money would be worth in the index. */
  benchmark_equivalent_eur?: Money;
  /** `(result + latent) − (equivalent − invested)`. Absent when anything is missing. */
  result_vs_index_eur?: Money;
  missing_benchmark: BenchmarkGap[];
}

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
      if (price !== undefined) {
        warnWithoutEur(warnings, price);
      }
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
        {
          asset_id: assetId,
          age_days: price.age_days,
          date: price.date,
          limit_days: settings.stale_price_days,
        },
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
      ...thesisPartOf(openThesisOn(state, accountId, assetId, date), date),
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

/** The greatest fiscal date among the legs, or nothing when there are none. */
const lastFiscalDateOf = (legs: readonly ThesisLeg[]): CivilDate | undefined => {
  let last: CivilDate | undefined;
  for (const leg of legs) {
    if (last === undefined || leg.fiscal_date > last) {
      last = leg.fiscal_date;
    }
  }
  return last;
};

/**
 * What the same money, on the same dates, would have made in the index
 * (business rule 16, decision (b) of prompt 005):
 *
 *     benchmark_equivalent_eur = Σ cost_i × P(d_fin) / P(d_i)
 *
 * `P(d)` is the price of the benchmark on `d` **in euros** (Q2: the user would
 * have put euros in the index, so the comparable return is theirs, currency
 * effect included), and `d_fin` is the fiscal date of the last linked sale of a
 * closed thesis, or the date asked while it is open.
 *
 * If any `P(d)` is missing the whole comparison is missing: a partial sum would
 * be a number nobody can reproduce (constitution V).
 */
const benchmarkEquivalentOf = (
  state: LedgerState,
  thesis: ThesisView,
  benchmarkId: AssetId,
  date: CivilDate,
  settings: Settings,
  gaps: BenchmarkGap[],
  external?: ExternalPrices,
): Money | undefined => {
  // A finished bet is measured to the day it finished, never to today: an open
  // thesis moves with the market, a closed one does not get to change sign
  // depending on the day it is looked at. "Last sale" is the one with the
  // greatest **fiscal** date, not the last of the array: the legs pile up in
  // file order, which is not the fiscal order when the rule is `value_date` or
  // when a later rectification arrives. A thesis closed with no sale at all —
  // its asset was swapped — ends on the day it was closed.
  const end =
    thesis.status === "closed"
      ? (lastFiscalDateOf(thesis.sells) ?? (thesis.closed_at as CivilDate))
      : date;
  const endPrice = priceAt(state, benchmarkId, end, settings, external);
  const endEur = endPrice?.unit_value_eur;
  if (endEur === undefined) {
    gaps.push({ reason: "no_price", asset_id: benchmarkId, date: end });
    return undefined;
  }
  let equivalent = Money.zero(EUR);
  for (const leg of thesis.buys) {
    const price = priceAt(state, benchmarkId, leg.fiscal_date, settings, external);
    const eur = price?.unit_value_eur;
    if (eur === undefined) {
      gaps.push({ reason: "no_price", asset_id: benchmarkId, date: leg.fiscal_date });
      return undefined;
    }
    equivalent = equivalent.add(leg.amount_eur.mul(endEur.amount.div(eur.amount)));
  }
  return equivalent;
};

/**
 * What of its own asset a thesis still holds, by **lineage**: the open lots
 * whose root — following `source_lot_id` up to the origin — is one of its own
 * purchases.
 *
 * "Bought minus sold" is not the same thing and silently loses shares: a split
 * multiplies a lot without any new purchase, so six shares bought and split two
 * for one are twelve shares of the thesis that `quantity_bought` never saw. The
 * lineage also keeps out what is not its own — the shares the next thesis on
 * the asset bought, and the ones a swap moved to another asset, which leave no
 * open lot of this one behind.
 */
const ownQuantityOf = (
  state: LedgerState,
  thesis: ThesisView,
  lots: Map<string, FiscalLot>,
): Quantity => {
  const own = new Set(thesis.buys.map((leg) => leg.event_id));
  let quantity = Quantity.ZERO;
  for (const lot of state.lots.get(thesis.asset_id)?.open ?? []) {
    if (own.has(rootEventOf(lots, lot))) {
      quantity = quantity.add(lot.quantity);
    }
  }
  return quantity;
};

/**
 * Latent gain of what **this thesis** still holds (`ownQuantityOf`), not of the
 * position of the pair (account, asset). A thesis closed while the pair still
 * holds something — because the next thesis on the asset bought more — must not
 * count shares that are not its own; that is the same mixing the statistics
 * exclude (decision (k)).
 */
const latentOf = (
  state: LedgerState,
  thesis: ThesisView,
  date: CivilDate,
  settings: Settings,
  gaps: BenchmarkGap[],
  lots: Map<string, FiscalLot>,
  external?: ExternalPrices,
): Money | undefined => {
  const own = ownQuantityOf(state, thesis, lots);
  if (!own.isPositive()) {
    return Money.zero(EUR);
  }
  const price = priceAt(state, thesis.asset_id, date, settings, external);
  const unitCost = openUnitCostOf(state, thesis.asset_id);
  const value = positionValueOf(price, own);
  if (value === undefined || unitCost === undefined) {
    gaps.push({ reason: "no_asset_price", asset_id: thesis.asset_id, date });
    return undefined;
  }
  return value.sub(unitCost.mul(own.value));
};

export interface BucketThesesView {
  rows: BucketThesisView[];
  /** What keeps the comparison with the index from existing, said once per cause. */
  warnings: Warning[];
}

/**
 * The gaps of the index, turned into warnings the views cannot forget to show.
 * A gap lives inside each thesis, which is the right place to read it one by
 * one, and the wrong place to notice it: three theses without an index printed
 * the same as three theses beating it. Said once per cause, not per thesis.
 *
 * `no_linked_buys` and `no_asset_price` are facts of the thesis, not gaps of
 * the benchmark: the first means nothing was ever put in, and the second is
 * already the `partial_bucket_total` of its own asset.
 */
const benchmarkWarningsOf = (rows: readonly BucketThesisView[]): Warning[] => {
  const warnings: Warning[] = [];
  const said = new Set<string>();
  const once = (
    key: string,
    code: string,
    message: string,
    details: Record<string, unknown>,
  ): void => {
    if (!said.has(key)) {
      said.add(key);
      warn(warnings, code, message, details);
    }
  };
  for (const thesis of rows) {
    for (const gap of thesis.missing_benchmark) {
      switch (gap.reason) {
        case "no_benchmark":
          once(
            "no_benchmark",
            "missing_benchmark_asset",
            "no benchmark asset configured: rule 16 has nothing to compare against",
            {},
          );
          break;
        case "unknown_asset":
          once(
            `unknown|${gap.asset_id}`,
            "unknown_benchmark_asset",
            `the benchmark ${gap.asset_id} is not in the catalogue`,
            {
              asset_id: gap.asset_id,
            },
          );
          break;
        case "no_price":
          once(
            `price|${gap.asset_id}|${gap.date}`,
            "missing_benchmark_price",
            `no price for the benchmark ${gap.asset_id} at ${gap.date}`,
            { asset_id: gap.asset_id, date: gap.date },
          );
          break;
        default:
          break;
      }
    }
  }
  return warnings;
};

/**
 * The theses with their result against the index (§3.3). It **wraps** `theses()`
 * instead of extending it: pass B of the projection uses `theses.ts`, and the
 * path that creates lots and gains must never learn what a price is
 * (constitution II, enforced by the architecture test).
 */
export const bucketTheses = (
  state: LedgerState,
  date: CivilDate,
  settings: Settings,
  external?: ExternalPrices,
): BucketThesesView => {
  const benchmarkId = settings.bucket_benchmark_asset_id;
  const lots = lotIndexOf(state);
  const rows = theses(state, date).map((thesis) => {
    const gaps: BenchmarkGap[] = [];
    const latent = latentOf(state, thesis, date, settings, gaps, lots, external);
    let equivalent: Money | undefined;
    if (benchmarkId === undefined) {
      gaps.push({ reason: "no_benchmark" });
    } else if (!state.assets.has(benchmarkId)) {
      gaps.push({ reason: "unknown_asset", asset_id: benchmarkId });
    } else if (thesis.buys.length === 0) {
      // Nothing was ever put in: the index would have made nothing out of
      // nothing, and that is "no data", not zero (Q6).
      gaps.push({ reason: "no_linked_buys" });
    } else {
      equivalent = benchmarkEquivalentOf(
        state,
        thesis,
        benchmarkId,
        date,
        settings,
        gaps,
        external,
      );
    }
    const comparable = equivalent !== undefined && latent !== undefined;
    return {
      ...thesis,
      ...(latent === undefined ? {} : { unrealized_eur: latent }),
      ...(benchmarkId === undefined ? {} : { benchmark_asset_id: benchmarkId }),
      ...(equivalent === undefined ? {} : { benchmark_equivalent_eur: equivalent }),
      ...(comparable
        ? {
            result_vs_index_eur: thesis.result_eur
              .add(latent as Money)
              .sub((equivalent as Money).sub(thesis.invested_eur)),
          }
        : {}),
      missing_benchmark: gaps,
    };
  });
  return { rows, warnings: benchmarkWarningsOf(rows) };
};
