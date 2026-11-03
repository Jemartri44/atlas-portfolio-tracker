// The exposure of the core as the screens show it (docs/business-rules.md, «Exposición por divisa y
// región»): the bars of the whole, and one row per asset with where its split comes from. Plain data;
// nothing here reads a store.
//
// - Every split is shown as a bar **and** as text: the colour never carries the figure alone, and
//   the percentages stay in sight with the privacy mode on.
// - The label of a default is always complete: «por defecto · <índice> (según la cartera de <ETF>) ·
//   ficha <fecha>». An index chosen by the owner that is no longer in the tables is said, not hidden.

import type { Asset } from "@atlas/domain";
import {
  DEFAULT_INDEX_TABLES,
  type Exposure,
  type ExposureAsset,
  type ExposureCatalogue,
  type ExposureDimension,
  type Exposures,
  INDEX_PROFILES,
  resolveAsset,
  type Split,
} from "@atlas/domain/portfolio";
import type { NameIndex } from "../../format/names.js";
import { type BarView, barOf, barOfSplit, type Dimension, indexLabel } from "./exposure-bars.js";

export {
  type BarView,
  barOf,
  type Dimension,
  indexLabel,
  keyLabel,
  regionOptions,
} from "./exposure-bars.js";
export { withIndex, withoutOwn, withSplit } from "./exposure-edit.js";

// ---- The whole core (Cartera) ------------------------------------------------------------------

export interface DimensionView {
  /** Absent when an asset with value has no split here: `missing` says which. */
  bar?: BarView;
  missing: string[];
}

export interface ExposureBlockView {
  /** A price is missing: no figure at all. */
  partial: boolean;
  currency: DimensionView;
  region: DimensionView;
  counts: { owner: number; default: number; none: number };
  /** Every default in use, complete: one line per index. */
  defaults: string[];
  /** Assets whose chosen index is no longer in the tables. */
  lost: { asset: string; index: string }[];
}

const dimensionView = (
  dimension: Dimension,
  data: ExposureDimension,
  names: NameIndex,
): DimensionView => ({
  ...(data.shares === undefined
    ? {}
    : {
        bar: barOf(
          dimension,
          data.shares.map((share) => ({ key: share.key, pct: share.pct.toString() })),
        ),
      }),
  missing: data.missing_assets.map((id) => names[id] ?? id),
});

export const exposureBlockView = (exposure: Exposure, names: NameIndex): ExposureBlockView => {
  const entries = [...exposure.currency.assets, ...exposure.region.assets];
  const defaults = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.state === "default" && entry.index !== undefined ? [indexLabel(entry.index)] : [],
      ),
    ),
  ];
  const lost = new Map(
    entries.flatMap((entry) =>
      entry.lost_index === undefined ? [] : [[entry.asset_id, entry.lost_index] as const],
    ),
  );
  return {
    partial: exposure.gap === "partial",
    currency: dimensionView("currency", exposure.currency, names),
    region: dimensionView("region", exposure.region, names),
    counts: exposure.counts,
    defaults,
    lost: [...lost].map(([asset, index]) => ({ asset: names[asset] ?? asset, index })),
  };
};

// ---- One asset (Ajustes) -----------------------------------------------------------------------

export interface DimensionRowView {
  state: ExposureAsset["state"];
  /** The complete label of a default; absent when the split is the owner's or there is none. */
  label?: string;
  bar?: BarView;
  /** The split in force, for editing. */
  split?: Split;
}

export interface ExposureRowView {
  assetId: string;
  name: string;
  /** The index the owner chose, or `""`. */
  chosen: string;
  /** What Atlas proposes when nothing is chosen, for the hint of the selector. */
  proposed?: string;
  /** The chosen index is no longer in the tables. */
  lostIndex?: string;
  currency: DimensionRowView;
  region: DimensionRowView;
  /** Whether the owner has anything of their own for this asset to restore. */
  hasOwn: boolean;
}

const dimensionRow = (dimension: Dimension, resolved: ExposureAsset): DimensionRowView => ({
  state: resolved.state,
  ...(resolved.state === "default" && resolved.index !== undefined
    ? { label: indexLabel(resolved.index) }
    : {}),
  ...(resolved.split === undefined
    ? {}
    : { bar: barOfSplit(dimension, resolved.split), split: resolved.split }),
});

/** The assets of the core that are in force, each with where its split comes from, valued or not. */
export const exposureRows = (
  held: readonly Asset[],
  exposures: Exposures,
  catalogue: ExposureCatalogue,
): ExposureRowView[] =>
  held
    .flatMap((asset) =>
      asset.book === "core" && asset.active && asset.asset_class !== undefined
        ? [{ asset, assetClass: asset.asset_class }]
        : [],
    )
    .map(({ asset, assetClass }) => {
      const resolve = (dimension: Dimension) =>
        resolveAsset(
          asset.asset_id,
          assetClass,
          exposures,
          catalogue,
          DEFAULT_INDEX_TABLES,
          dimension,
        );
      const currency = resolve("currency");
      const region = resolve("region");
      const own = exposures[asset.asset_id];
      const lost = currency.lost_index;
      const proposed = [currency, region].find((entry) => entry.index?.proposed === true)?.index;
      return {
        assetId: asset.asset_id,
        name: asset.name,
        chosen:
          own?.index !== undefined && INDEX_PROFILES[own.index] !== undefined ? own.index : "",
        ...(proposed === undefined ? {} : { proposed: proposed.name }),
        ...(lost === undefined ? {} : { lostIndex: lost }),
        currency: dimensionRow("currency", currency),
        region: dimensionRow("region", region),
        hasOwn: own?.currency !== undefined || own?.region !== undefined,
      };
    });

/** What the selector of an index offers. */
export const indexOptions = (): { value: string; label: string }[] =>
  Object.values(INDEX_PROFILES)
    .map((profile) => ({ value: profile.key, label: profile.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
