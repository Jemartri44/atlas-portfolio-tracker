// One ISIN, one asset (ADR-0009, feature 009 review). The tax agency reads an
// ISIN without caring how it was typed, so the system compares it the same way:
// `ie00b0000001` and `IE00B0000001` are one security.

import type { AssetId } from "../schema/events.js";

/** An ISIN as it is compared: upper case and without spaces. */
export const normalizeIsin = (isin: string): string => isin.toUpperCase().replace(/\s+/g, "");

/**
 * The ISINs that two or more assets of a catalogue share, normalized, with
 * those assets in catalogue order. Assets without an ISIN share nothing.
 */
export const sharedIsins = (
  assets: Iterable<{ asset_id: AssetId; isin?: string }>,
): Map<string, AssetId[]> => {
  const byIsin = new Map<string, AssetId[]>();
  for (const asset of assets) {
    if (asset.isin !== undefined) {
      const key = normalizeIsin(asset.isin);
      byIsin.set(key, [...(byIsin.get(key) ?? []), asset.asset_id]);
    }
  }
  return new Map([...byIsin].filter(([, ids]) => ids.length > 1));
};
