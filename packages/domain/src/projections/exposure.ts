// How the core is exposed by currency and by region (specification §6.1). `asset.currency` is the
// currency an asset trades in, not the one its value moves with (a world ETF in euros is mostly
// dollars), so the owner declares the exposure per asset: percentages that add up to 100.
//
// - **Core only**: the bucket never takes part (constitution III). Positions only: the cash of
//   the core is not in `coreWeights`, so it is not here either.
// - The exposure is a parameter, validated by `validateExposure` (`exposure-file.ts`), which also
//   guards its storage outside the ledger.
// - **The owner does not have to know these percentages**. Per asset and dimension: the owner's own
//   split wins; else the default of the index of the asset (chosen by the owner in `index`, or
//   proposed from the fund's ISIN or the class, `index-profiles.ts`), marked as such with the index
//   and the date of its factsheet; else **no data, not a guess**: the dimension has no breakdown and
//   lists the assets without one.
// - Informative: it reads current prices, nothing fiscal reads it.

import { Decimal, HUNDRED } from "../money/decimal.js";
import { EUR, Money } from "../money/money.js";
import type { AssetClass, AssetId } from "../schema/events.js";
import { EXPOSURE_FORMAT, validateExposure } from "./exposure-file.js";
import { DEFAULT_INDEX_TABLES, type IndexProfile, type IndexTables } from "./index-profiles.js";
import type { CoreWeights } from "./weights.js";

/** One dimension of an asset: key → percent, adding up to 100. */
export type Split = Readonly<Record<string, string>>;

export interface AssetExposure {
  /** Key of an index profile the defaults come from. */
  index?: string;
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

/** Where the split of an asset in one dimension comes from. */
export type ExposureState = "owner" | "default" | "none";

/** The index a default comes from, always shown with its date. */
export interface ExposureIndex {
  key: string;
  name: string;
  /** The date of the factsheet. */
  as_of: string;
  /** Chosen by the owner, or proposed by Atlas from the fund's ISIN or the class. */
  proposed: boolean;
}

export interface ExposureAsset {
  asset_id: AssetId;
  state: ExposureState;
  index?: ExposureIndex;
}

export interface ExposureDimension {
  /** Absent when an asset with value has no split here, own or by default. */
  shares?: ExposureShare[];
  /** Assets with value and no split here: why `shares` is absent. */
  missing_assets: AssetId[];
  /** Assets whose split here is the default of an index, not the owner's. */
  defaulted: AssetId[];
  /** Each asset with value and where its split comes from. */
  assets: ExposureAsset[];
}

export interface Exposure {
  /** A core asset held has no price: no figure at all. */
  gap?: "partial";
  total_eur: Money;
  currency: ExposureDimension;
  region: ExposureDimension;
  /**
   * How many assets with value are on the owner's own percentages, on the defaults of an index, or
   * without a split in some dimension (sin propuesta).
   */
  counts: { owner: number; default: number; none: number };
}

/** What `exposure` needs to know of an asset besides its id. */
export type ExposureCatalogue = ReadonlyMap<AssetId, { isin?: string }>;

const indexOf = (
  assetId: AssetId,
  assetClass: AssetClass,
  exposures: Exposures,
  catalogue: ExposureCatalogue,
  tables: IndexTables,
): { profile: IndexProfile; proposed: boolean } | undefined => {
  const chosen = exposures[assetId]?.index;
  const isin = catalogue.get(assetId)?.isin;
  const key =
    chosen ??
    (isin === undefined ? undefined : tables.funds[isin]?.index) ??
    tables.byClass[assetClass];
  const profile = key === undefined ? undefined : tables.profiles[key];
  return profile === undefined ? undefined : { profile, proposed: chosen === undefined };
};

const dimensionOf = (
  weights: CoreWeights,
  exposures: Exposures,
  catalogue: ExposureCatalogue,
  tables: IndexTables,
  dimension: "currency" | "region",
): ExposureDimension => {
  const missing: AssetId[] = [];
  const defaulted: AssetId[] = [];
  const assets: ExposureAsset[] = [];
  const sums = new Map<string, Money>();
  for (const row of weights.rows) {
    // Every row has a value here: a partial core returned before reaching this point.
    const value = row.value_eur as Money;
    if (!value.amount.isPositive()) {
      continue;
    }
    const own = exposures[row.asset_id]?.[dimension];
    const found = indexOf(row.asset_id, row.asset_class, exposures, catalogue, tables);
    const split = own ?? found?.profile[dimension];
    if (split === undefined) {
      missing.push(row.asset_id);
      assets.push({ asset_id: row.asset_id, state: "none" });
      continue;
    }
    if (own === undefined) {
      defaulted.push(row.asset_id);
    }
    const profile = found?.profile;
    assets.push({
      asset_id: row.asset_id,
      state: own === undefined ? "default" : "owner",
      ...(own !== undefined || profile === undefined || found === undefined
        ? {}
        : {
            index: {
              key: profile.key,
              name: profile.name,
              as_of: profile.as_of,
              proposed: found.proposed,
            },
          }),
    });
    for (const [key, pct] of Object.entries(split)) {
      sums.set(
        key,
        (sums.get(key) ?? Money.zero(EUR)).add(value.mul(Decimal.parse(pct)).div(HUNDRED)),
      );
    }
  }
  if (missing.length > 0) {
    return { missing_assets: missing, defaulted, assets };
  }
  const shares = [...sums.entries()]
    .map(([key, value]) => ({
      key,
      value_eur: value,
      pct: value.amount.mul(HUNDRED).div(weights.total_eur.amount),
    }))
    .sort((a, b) => b.value_eur.amount.cmp(a.value_eur.amount) || a.key.localeCompare(b.key));
  return { shares, missing_assets: [], defaulted, assets };
};

/** One state per asset across both dimensions: none if either lacks, default if either is, else owner. */
const countsOf = (currency: ExposureDimension, region: ExposureDimension) => {
  const counts = { owner: 0, default: 0, none: 0 };
  currency.assets.forEach((entry, index) => {
    const other = (region.assets[index] as ExposureAsset).state;
    const states = [entry.state, other];
    counts[states.includes("none") ? "none" : states.includes("default") ? "default" : "owner"] +=
      1;
  });
  return counts;
};

export const exposure = (
  weights: CoreWeights,
  exposures: Exposures,
  catalogue: ExposureCatalogue = new Map(),
  tables: IndexTables = DEFAULT_INDEX_TABLES,
): Exposure => {
  // Everything declared is checked, valued or not: a bad split must not wait for the purchase.
  validateExposure({ exposure_format: EXPOSURE_FORMAT, assets: exposures });
  const empty: ExposureDimension = { missing_assets: [], defaulted: [], assets: [] };
  if (weights.partial) {
    return {
      gap: "partial",
      total_eur: weights.total_eur,
      currency: empty,
      region: empty,
      counts: { owner: 0, default: 0, none: 0 },
    };
  }
  const currency = dimensionOf(weights, exposures, catalogue, tables, "currency");
  const region = dimensionOf(weights, exposures, catalogue, tables, "region");
  return { total_eur: weights.total_eur, currency, region, counts: countsOf(currency, region) };
};
