// How the core is exposed by currency and by region (specification §6.1). `asset.currency` is the
// currency an asset trades in, not the one its value moves with (a world ETF in euros is mostly
// dollars), so the owner declares the exposure per asset: percentages that add up to 100.
//
// - **Core only**: the bucket never takes part (constitution III). Positions only: the cash of
//   the core is not in `coreWeights`, so it is not here either.
// - The exposure is a parameter, validated by `validateExposure` (`exposure-file.ts`), which also
//   guards its storage outside the ledger.
// - **No data, not a guess**: if an asset with value declares no exposure for a dimension, that
//   dimension has no breakdown and lists the assets. The one exception is the currency of gold and
//   crypto, USD when the owner says nothing else, and `defaulted` lists them so the output says it.
// - Informative: it reads current prices, nothing fiscal reads it.

import { Decimal, HUNDRED } from "../money/decimal.js";
import { EUR, Money } from "../money/money.js";
import type { AssetClass, AssetId } from "../schema/events.js";
import { EXPOSURE_FORMAT, validateExposure } from "./exposure-file.js";
import type { CoreWeights } from "./weights.js";

/** One dimension of an asset: key → percent, adding up to 100. */
export type Split = Readonly<Record<string, string>>;

export interface AssetExposure {
  currency?: Split;
  region?: Split;
}

export type Exposures = Readonly<Record<AssetId, AssetExposure>>;

export interface ExposureShare {
  key: string;
  value_eur: Money;
  /** Of the core's value. */
  pct: Decimal;
}

export interface ExposureDimension {
  /** Absent when an asset with value declares nothing for this dimension. */
  shares?: ExposureShare[];
  /** Assets with value and no declared exposure here: why `shares` is absent. */
  missing_assets: AssetId[];
  /** Assets whose split is the default (USD for gold and crypto), not the owner's. */
  defaulted: AssetId[];
}

export interface Exposure {
  /** A core asset held has no price: no figure at all. */
  gap?: "partial";
  total_eur: Money;
  currency: ExposureDimension;
  region: ExposureDimension;
}

/** Gold and crypto move with the dollar unless the owner declares otherwise. */
const USD_BY_DEFAULT: ReadonlySet<AssetClass> = new Set(["gold", "crypto"]);
const USD: Split = { USD: "100" };

const dimensionOf = (
  weights: CoreWeights,
  exposures: Exposures,
  dimension: "currency" | "region",
): ExposureDimension => {
  const missing: AssetId[] = [];
  const defaulted: AssetId[] = [];
  const sums = new Map<string, Money>();
  for (const row of weights.rows) {
    // Every row has a value here: a partial core returned before reaching this point.
    const value = row.value_eur as Money;
    if (!value.amount.isPositive()) {
      continue;
    }
    const declared = exposures[row.asset_id]?.[dimension];
    let split = declared;
    if (split === undefined && dimension === "currency" && USD_BY_DEFAULT.has(row.asset_class)) {
      split = USD;
      defaulted.push(row.asset_id);
    }
    if (split === undefined) {
      missing.push(row.asset_id);
      continue;
    }
    for (const [key, pct] of Object.entries(split)) {
      sums.set(
        key,
        (sums.get(key) ?? Money.zero(EUR)).add(value.mul(Decimal.parse(pct)).div(HUNDRED)),
      );
    }
  }
  if (missing.length > 0) {
    return { missing_assets: missing, defaulted };
  }
  const shares = [...sums.entries()]
    .map(([key, value]) => ({
      key,
      value_eur: value,
      pct: value.amount.mul(HUNDRED).div(weights.total_eur.amount),
    }))
    .sort((a, b) => b.value_eur.amount.cmp(a.value_eur.amount) || a.key.localeCompare(b.key));
  return { shares, missing_assets: [], defaulted };
};

export const exposure = (weights: CoreWeights, exposures: Exposures): Exposure => {
  // Everything declared is checked, valued or not: a bad split must not wait for the purchase.
  validateExposure({ exposure_format: EXPOSURE_FORMAT, assets: exposures });
  const empty: ExposureDimension = { missing_assets: [], defaulted: [] };
  if (weights.partial) {
    return { gap: "partial", total_eur: weights.total_eur, currency: empty, region: empty };
  }
  return {
    total_eur: weights.total_eur,
    currency: dimensionOf(weights, exposures, "currency"),
    region: dimensionOf(weights, exposures, "region"),
  };
};
