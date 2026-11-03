// Changing the exposure file: the index chosen, the owner's own split of a dimension, and back to the
// defaults. An asset with nothing left to say is not kept in the file.

import type { Exposures, Split } from "@atlas/domain/portfolio";
import type { Dimension } from "./exposure-bars.js";

type Own = { index?: string; currency?: Split; region?: Split };

const without = (exposures: Exposures, assetId: string): Record<string, Own> => {
  const { [assetId]: _dropped, ...rest } = exposures as Record<string, Own>;
  return rest;
};

/** An asset with nothing left to say is not kept in the file. */
const tidy = (exposures: Exposures, assetId: string, own: Own): Exposures =>
  own.index === undefined && own.currency === undefined && own.region === undefined
    ? without(exposures, assetId)
    : { ...exposures, [assetId]: own };

/** The index chosen (or `""`: back to the proposal), keeping the owner's own splits. */
export const withIndex = (exposures: Exposures, assetId: string, index: string): Exposures => {
  const { index: _old, ...rest } = (exposures[assetId] ?? {}) as Own;
  return tidy(exposures, assetId, index === "" ? rest : { ...rest, index });
};

/** The owner's own split of a dimension. */
export const withSplit = (
  exposures: Exposures,
  assetId: string,
  dimension: Dimension,
  split: Split,
): Exposures => tidy(exposures, assetId, { ...(exposures[assetId] ?? {}), [dimension]: split });

/** Back to the defaults: the owner's own splits go, the index chosen stays. */
export const withoutOwn = (exposures: Exposures, assetId: string): Exposures => {
  const { currency: _c, region: _r, ...rest } = (exposures[assetId] ?? {}) as Own;
  return tidy(exposures, assetId, rest);
};
