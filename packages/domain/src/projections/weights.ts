// Core weights and deviations (data-schema.md §7, business rules 1, 3 and 6b).
//
// Only the `core` book: the bucket is a budget, never an allocation, and the
// two never share a row or a total (constitution III). A missing price is
// visible, never a zero: the row says so and the weights are not computed over
// a partial total (constitution V, decision (c) of prompt 004).

import type { CivilDate } from "../dates/civil-date.js";
import { Decimal } from "../money/decimal.js";
import { Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import type { AssetClass, AssetId } from "../schema/events.js";
import { ASSET_CLASSES } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { type ManualPrice, manualPrices } from "./prices.js";
import type { LedgerState, Warning } from "./state.js";

/** Satellites (business rule 6b): 0 % or at least the minimum, never in between. */
const SATELLITE_CLASSES: readonly AssetClass[] = ["gold", "crypto"];

export interface CoreWeightRow {
  asset_id: AssetId;
  asset_class: AssetClass;
  /** Aggregated across the core accounts holding it. */
  quantity: Quantity;
  /** Absent when there is no valuation on or before the date. */
  price?: ManualPrice;
  /** `quantity × unit_value_eur`; zero without a position, absent without a price. */
  value_eur?: Money;
  target_pct: Decimal;
  /** Empty when the core total is partial. */
  weight_pct?: Decimal;
  /** `weight_pct − target_pct`, in percentage points. Empty when the total is partial. */
  deviation_pp?: Decimal;
}

export interface ClassSubtotal {
  asset_class: AssetClass;
  value_eur: Money;
  target_pct: Decimal;
  weight_pct?: Decimal;
  deviation_pp?: Decimal;
}

export interface CoreWeights {
  date: CivilDate;
  rows: CoreWeightRow[];
  by_class: ClassSubtotal[];
  /** Sum of what does have a value; labelled partial when a price is missing. */
  total_eur: Money;
  partial: boolean;
  /** Assets with a position and no price: the reason the total is partial. */
  missing_prices: AssetId[];
  stale_prices: AssetId[];
  warnings: Warning[];
}

const HUNDRED = Decimal.parse("100");

const warn = (
  warnings: Warning[],
  code: string,
  message: string,
  details: Record<string, unknown>,
  eventId = "",
): void => {
  warnings.push({ code, event_id: eventId, message, details });
};

/** Ids of the accounts of the core book. */
export const coreAccountIds = (state: LedgerState): Set<string> => {
  const ids = new Set<string>();
  for (const [accountId, account] of state.accounts) {
    if (account.book === "core") {
      ids.add(accountId);
    }
  }
  return ids;
};

/** Quantity of an asset across every core account, from the physical positions. */
export const coreQuantityOf = (
  state: LedgerState,
  assetId: AssetId,
  core = coreAccountIds(state),
): Quantity => {
  let total = Quantity.ZERO;
  for (const [key, quantity] of state.positions) {
    const [accountId, keyAsset] = key.split("|");
    if (keyAsset === assetId && core.has(accountId as string)) {
      total = total.add(quantity);
    }
  }
  return total;
};

/**
 * Assets the table covers: a core asset held, or one with a target weight even
 * with no position — the largest possible deviation is an untouched target, and
 * a zero position is worth zero without needing a price (Q1, resolved).
 */
const universeOf = (
  state: LedgerState,
  targets: Record<string, string>,
): Map<AssetId, Quantity> => {
  const universe = new Map<AssetId, Quantity>();
  for (const [assetId, asset] of state.assets) {
    if (asset.book !== "core") {
      continue;
    }
    const quantity = coreQuantityOf(state, assetId);
    const target = targets[assetId];
    if (quantity.isPositive() || (target !== undefined && Decimal.parse(target).isPositive())) {
      universe.set(assetId, quantity);
    }
  }
  return universe;
};

const classOrder = (asset_class: AssetClass): number => ASSET_CLASSES.indexOf(asset_class);

/** Table order: by asset class as the plan lists them, then by id. */
export const sortWeightRows = (rows: CoreWeightRow[]): CoreWeightRow[] =>
  rows.sort((a, b) =>
    classOrder(a.asset_class) === classOrder(b.asset_class)
      ? a.asset_id.localeCompare(b.asset_id)
      : classOrder(a.asset_class) - classOrder(b.asset_class),
  );

/** Target weight of an asset, or zero when the plan does not mention it. */
const targetOf = (targets: Record<string, string>, assetId: AssetId): Decimal =>
  targets[assetId] === undefined ? Decimal.ZERO : Decimal.parse(targets[assetId] as string);

const percentOf = (value: Money, total: Money): Decimal =>
  total.amount.eq(Decimal.ZERO) ? Decimal.ZERO : value.amount.div(total.amount).mul(HUNDRED);

/** Target weights whose key is not a core asset of the catalogue: a warning, never a rejection (decision (a)). */
const warnUnknownTargets = (
  state: LedgerState,
  targets: Record<string, string>,
  warnings: Warning[],
): void => {
  for (const assetId of Object.keys(targets)) {
    if (state.assets.get(assetId)?.book !== "core") {
      warn(
        warnings,
        "unknown_target_weight",
        `el peso objetivo de ${assetId} no corresponde a ningún activo del núcleo`,
        { asset_id: assetId },
      );
    }
  }
};

const warnThresholds = (
  rows: readonly CoreWeightRow[],
  subtotals: readonly ClassSubtotal[],
  settings: Settings,
  warnings: Warning[],
): void => {
  const threshold = settings.deviation_threshold_pp;
  if (threshold !== undefined) {
    const limit = Decimal.parse(threshold);
    for (const row of rows) {
      if (row.deviation_pp?.abs().gt(limit) === true) {
        warn(
          warnings,
          "deviation_above_threshold",
          `${row.asset_id} se desvía ${row.deviation_pp.round(2).toString()} pp del objetivo (umbral ${limit.toString()})`,
          {
            asset_id: row.asset_id,
            deviation_pp: row.deviation_pp.round(2).toString(),
            threshold_pp: limit.toString(),
          },
        );
      }
    }
  }
  const minimum = settings.satellite_min_weight_pct;
  if (minimum === undefined) {
    return;
  }
  const floor = Decimal.parse(minimum);
  for (const subtotal of subtotals) {
    const weight = subtotal.weight_pct;
    if (!SATELLITE_CLASSES.includes(subtotal.asset_class) || weight === undefined) {
      continue;
    }
    if (weight.isPositive() && weight.lt(floor)) {
      warn(
        warnings,
        "satellite_below_minimum",
        `${subtotal.asset_class} pesa ${weight.round(2).toString()} %, por debajo del mínimo de satélite (${floor.toString()} %)`,
        {
          asset_class: subtotal.asset_class,
          weight_pct: weight.round(2).toString(),
          minimum_pct: floor.toString(),
        },
      );
    }
  }
};

/**
 * Fills in the percentages of every row, builds the subtotals per class and
 * raises the threshold warnings. Shared with the transfer simulator, which
 * moves value between two rows and asks the same questions of the result.
 */
export const deriveWeights = (
  rows: CoreWeightRow[],
  total: Money,
  partial: boolean,
  settings: Settings,
  warnings: Warning[],
): ClassSubtotal[] => {
  for (const row of rows) {
    if (!partial && row.value_eur !== undefined) {
      row.weight_pct = percentOf(row.value_eur, total);
      row.deviation_pp = row.weight_pct.sub(row.target_pct);
    }
  }
  const by_class: ClassSubtotal[] = [];
  for (const asset_class of ASSET_CLASSES) {
    const members = rows.filter((row) => row.asset_class === asset_class);
    if (members.length === 0) {
      continue;
    }
    const value = members.reduce(
      (sum, row) => (row.value_eur === undefined ? sum : sum.add(row.value_eur)),
      Money.zero("EUR"),
    );
    const target = members.reduce((sum, row) => sum.add(row.target_pct), Decimal.ZERO);
    const subtotal: ClassSubtotal = { asset_class, value_eur: value, target_pct: target };
    if (!partial) {
      subtotal.weight_pct = percentOf(value, total);
      subtotal.deviation_pp = subtotal.weight_pct.sub(target);
    }
    by_class.push(subtotal);
  }
  warnThresholds(rows, by_class, settings, warnings);
  return by_class;
};

/** Weights, deviations and threshold warnings of the core book at a date. */
export const coreWeights = (
  state: LedgerState,
  date: CivilDate,
  settings: Settings,
): CoreWeights => {
  const targets = settings.target_weights ?? {};
  const prices = manualPrices(state, date, settings);
  const warnings: Warning[] = [];
  warnUnknownTargets(state, targets, warnings);

  const missing: AssetId[] = [];
  const stale: AssetId[] = [];
  const rows: CoreWeightRow[] = [];
  let total = Money.zero("EUR");

  for (const [assetId, quantity] of universeOf(state, targets)) {
    const asset = state.assets.get(assetId);
    const price = prices.get(assetId);
    const target = targetOf(targets, assetId);
    if (quantity.isPositive() && targets[assetId] === undefined) {
      warn(
        warnings,
        "asset_without_target",
        `${assetId} tiene posición y ningún peso objetivo asignado`,
        { asset_id: assetId },
      );
    }
    // A zero position is worth zero without a price; only a live position needs one.
    const value =
      price === undefined
        ? quantity.isPositive()
          ? undefined
          : Money.zero("EUR")
        : Money.of(price.unit_value_eur.amount.mul(quantity.value), "EUR");
    if (value === undefined) {
      missing.push(assetId);
    } else {
      total = total.add(value);
    }
    if (price?.stale === true && quantity.isPositive()) {
      stale.push(assetId);
    }
    rows.push({
      asset_id: assetId,
      asset_class: asset?.asset_class as AssetClass,
      quantity,
      ...(price === undefined ? {} : { price }),
      ...(value === undefined ? {} : { value_eur: value }),
      target_pct: target,
    });
  }

  sortWeightRows(rows);
  const partial = missing.length > 0;
  if (partial) {
    warn(
      warnings,
      "partial_core_total",
      `faltan precios de ${missing.join(", ")} a ${date}: no se calculan pesos sobre un total parcial`,
      { assets: missing, date },
    );
  }
  const by_class = deriveWeights(rows, total, partial, settings, warnings);
  for (const assetId of stale) {
    const price = prices.get(assetId) as ManualPrice;
    warn(
      warnings,
      "stale_price",
      `${assetId}: precio de hace ${price.age_days} días (máximo ${settings.stale_price_days})`,
      { asset_id: assetId, age_days: price.age_days, date: price.date },
      price.event_id,
    );
  }
  return {
    date,
    rows,
    by_class,
    total_eur: total,
    partial,
    missing_prices: missing,
    stale_prices: stale,
    warnings,
  };
};
