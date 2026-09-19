// The catalogue turned into names: **the one place** that resolves an
// identifier of the ledger into what the user calls that thing.
//
// The ledger stores `acc_mi` and `ast_world` because an identifier has to be
// stable for twenty years, and it stores "Fondos indexados" and "World Index
// Fund" right next to them, in the catalogue events. Showing the identifier
// where the name exists turns the application into a debug dump — and it was
// doing exactly that in the patrimony, in the two hundred rows of the ledger,
// in the warnings and inside half the translated error messages (review of
// 2026-09-18).
//
// Three rules, all of them here so no screen has to remember them:
//
//   1. **The current name**, the one in force at the end of the ledger, not the
//      one it had on the date of the event: the user recognises their things by
//      what they are called today. The catalogue projection already resolves to
//      the last `account_updated`/`asset_updated`, so reading it is enough.
//   2. **An unknown identifier falls back to itself.** An incomplete catalogue,
//      an event that points at something that no longer exists, or a ledger not
//      loaded yet must never paint a blank — the identifier is worse than a
//      name and much better than nothing.
//   3. Nothing here is reactive and nothing reads a store: it takes the
//      projected state and returns plain data, so a test reaches all of it.

import { accounts, assets, type LedgerState } from "@atlas/domain";
import { formatDate } from "./date.js";

/**
 * Identifier → current name, for accounts and assets together.
 *
 * One map and not two: every caller already knows whether it is holding an
 * account or an asset (the field says so), and the two prefixes never collide
 * in practice. What matters is that a lookup cannot fail, only fall back.
 */
export type NameIndex = Readonly<Record<string, string>>;

/** No catalogue: every identifier resolves to itself. */
export const NO_NAMES: NameIndex = {};

/**
 * Theses live in the same index under a namespace of their own, so a thesis
 * the user called like an asset can never shadow it. A thesis has no name: it
 * is named by what it is about and when it was opened, which is how the user
 * remembers it — "th_alpha" is a key the ledger needs, not a word of theirs.
 */
const thesisKey = (id: string): string => `tesis:${id}`;

/**
 * What the units of an asset are called, beside a quantity: "12,5 part." and,
 * masked, "•••• part." (D2 of docs/design/system.md). In the same index under
 * its own namespace, like the theses, because it is the catalogue read for the
 * screen.
 */
const unitsKey = (id: string): string => `unidades:${id}`;

const UNITS: Readonly<Record<string, string>> = {
  fund: "part.",
  money_market: "part.",
  etf: "part.",
  stock: "acc.",
};

/** Units nobody has a better word for: ETC, ETP, crypto, an unknown asset. */
export const GENERIC_UNITS = "uds.";

/** Builds the index from a projected ledger. */
export const nameIndex = (state: LedgerState | undefined): NameIndex => {
  if (state === undefined) {
    return NO_NAMES;
  }
  const names: Record<string, string> = {};
  for (const account of accounts(state)) {
    if (account.name !== "") {
      names[account.account_id] = account.name;
    }
  }
  for (const asset of assets(state)) {
    if (asset.name !== "") {
      names[asset.asset_id] = asset.name;
    }
    names[unitsKey(asset.asset_id)] = UNITS[asset.asset_type] ?? GENERIC_UNITS;
  }
  for (const thesis of state.theses.values()) {
    names[thesisKey(thesis.thesis_id)] =
      `sobre ${names[thesis.asset_id] ?? thesis.asset_id} (abierta el ${formatDate(thesis.opened_at)})`;
  }
  return names;
};

/** "part.", "acc." or "uds.": what a quantity of this asset counts. */
export const unitsOf = (names: NameIndex, assetId: string | undefined): string =>
  assetId === undefined ? GENERIC_UNITS : (names[unitsKey(assetId)] ?? GENERIC_UNITS);

/** "sobre Alpha Robotics (abierta el 01/09/2026)", or the identifier when the ledger does not know it. */
export const displayThesis = (names: NameIndex, id: unknown): string =>
  typeof id === "string" ? (names[thesisKey(id)] ?? id) : displayName(names, id);

/**
 * **The** resolution function: the name of an identifier, or the identifier
 * itself when the catalogue does not know it.
 *
 * It takes `unknown` because half the callers are message templates reading a
 * detail of a domain error, where the value is typed as `unknown` and can be
 * absent. Anything that is not a non-empty string comes back as its own text,
 * which is what `text()` in the message catalogues already did.
 */
export const displayName = (names: NameIndex, id: unknown): string => {
  if (typeof id !== "string" || id === "") {
    return typeof id === "string" ? id : id === undefined ? "" : JSON.stringify(id);
  }
  return names[id] ?? id;
};

/** The same, over a list: `["ast_mm", "ast_gold"]` → "Money Market Fund, Oro físico". */
export const displayNames = (names: NameIndex, ids: unknown): string => {
  if (!Array.isArray(ids)) {
    return displayName(names, ids);
  }
  return ids.map((id) => displayName(names, id)).join(", ");
};

/**
 * How a message template prints an identifier. The catalogues receive this
 * instead of importing the index, so a message cannot resolve a name from
 * anywhere else: one index, one resolver, one helper.
 */
export interface Naming {
  /** One account or asset: its current name, or the identifier itself. */
  one: (id: unknown) => string;
  /** A list of them, comma separated. */
  many: (ids: unknown) => string;
  /** A thesis, by what it is about and when it was opened. */
  thesis: (id: unknown) => string;
}

/**
 * The identifier fields of the schema that point at the **catalogue** and
 * therefore resolve to a name. Every other `*_id` of a line points at an event
 * or a thesis, which have no name: showing them as themselves is all there is.
 */
export const NAMED_ID_FIELDS: ReadonlySet<string> = new Set([
  "account_id",
  "asset_id",
  "from_account_id",
  "from_asset_id",
  "to_account_id",
  "to_asset_id",
  "reference_etf_id",
  "bucket_benchmark_asset_id",
]);

/** The helper a message catalogue receives, built once per catalogue. */
export const namingOf = (names: NameIndex): Naming => ({
  one: (id) => displayName(names, id),
  many: (ids) => displayNames(names, ids),
  thesis: (id) => displayThesis(names, id),
});
