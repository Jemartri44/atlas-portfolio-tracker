// `positions.json` of the monthly dump (feature 016, E4; ADR-0032, point 3;
// `specs/016-scheduled-jobs/data-model.md` §4): the valued projection of the
// ledger **of the same dump**, written so that it reads without the
// application. It is a projection, never a source: it is regenerated from the
// ledger, and nothing reads it back (constitution I).
//
// - **The two books apart**, and their totals broken down, never added up
//   (constitution III): there is no total of both.
// - Amounts as **decimal strings** rounded to cents, as a screen shows them
//   (ADR-0005); a quantity exactly as the ledger has it.
// - A position without a price in euros says `value_eur: null` and
//   `price: { "source": "none" }`, never a zero; a total with one of those is
//   `partial` (constitution V).
// - Informative: the last known price, never a fiscal figure (domain trap 5).

import type { CivilDate } from "../dates/civil-date.js";
import type { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import { bucketPositions, openUnitCostOf } from "../projections/bucket.js";
import { netWorth } from "../projections/networth.js";
import { physicalPositions } from "../projections/positions.js";
import { type ExternalPrices, type PriceLookup, positionValueOf } from "../projections/prices.js";
import type { Account, Asset, LedgerState } from "../projections/state.js";
import { coreWeights } from "../projections/weights.js";
import type { AccountId, AssetClass, AssetId, Book } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";

export const POSITIONS_FORMAT = 1;

export type PositionPrice =
  | {
      readonly date: CivilDate;
      /** `manual`, or the source of an automatic close. */
      readonly source: string;
      readonly approximation: boolean;
    }
  | { readonly source: "none" };

export interface PositionRow {
  readonly account_id: AccountId;
  readonly asset_id: AssetId;
  readonly isin: string | undefined;
  readonly name: string;
  readonly asset_class?: AssetClass | undefined;
  readonly quantity: string;
  readonly cost_eur: string | null;
  readonly value_eur: string | null;
  readonly price: PositionPrice;
}

export interface CashRow {
  readonly account_id: AccountId;
  readonly book: Book;
  readonly currency: string;
  readonly amount: string;
  readonly value_eur: string | null;
}

export interface BlockTotal {
  readonly eur: string;
  /** Something of the block has no value in euros: the total is what does. */
  readonly partial: boolean;
}

export interface PositionsDocument {
  readonly positions_format: 1;
  readonly as_of: CivilDate;
  readonly generated_at: string;
  /** The `ledger.jsonl` of the same dump: which ledger this comes from. */
  readonly ledger: { readonly sha256: string; readonly lines: number };
  readonly note: string;
  readonly core: readonly PositionRow[];
  readonly bucket: readonly PositionRow[];
  readonly cash: readonly CashRow[];
  readonly totals: {
    readonly core: BlockTotal;
    readonly bucket: BlockTotal;
    readonly cash: BlockTotal;
  };
  /** The codes of the warnings of the projection, once each and sorted: never their text. */
  readonly warnings: readonly string[];
}

export interface PositionsInput {
  readonly state: LedgerState;
  readonly settings: Settings;
  readonly date: CivilDate;
  /** The closes and the ECB history of the cloud, when there are any. */
  readonly external?: ExternalPrices;
  readonly generatedAt: string;
  readonly ledger: { readonly sha256: string; readonly lines: number };
}

const cents = (value: Money | undefined): string | null =>
  value === undefined ? null : value.centsText();

const priceOf = (price: PriceLookup | undefined): PositionPrice =>
  price?.unit_value_eur === undefined
    ? { source: "none" }
    : {
        date: price.date,
        // A quote of the cloud carries its source; a valuation by hand does not.
        source: price.source ?? "manual",
        approximation: price.approximate === true,
      };

const byAccountThenAsset = (a: PositionRow, b: PositionRow): number =>
  a.account_id === b.account_id
    ? a.asset_id.localeCompare(b.asset_id)
    : a.account_id.localeCompare(b.account_id);

/** The cost of `quantity` at the average cost of the open lots of the asset; none without lots. */
const costOf = (state: LedgerState, assetId: AssetId, quantity: Quantity): Money | undefined =>
  openUnitCostOf(state, assetId)?.mul(quantity.value);

export const positionsDocument = (input: PositionsInput): PositionsDocument => {
  const { state, settings, date, external } = input;
  const weights = coreWeights(state, date, settings, external);
  const prices = new Map(weights.rows.map((row) => [row.asset_id, row.price]));
  const core: PositionRow[] = physicalPositions(state)
    .filter((position) => (state.accounts.get(position.account_id) as Account).book === "core")
    .map((position) => {
      // A position always names an asset of the catalogue: the projection refuses any other.
      const asset = state.assets.get(position.asset_id) as Asset;
      const price = prices.get(position.asset_id);
      return {
        account_id: position.account_id,
        asset_id: position.asset_id,
        // An absent ISIN is left out when written (`JSON.stringify` drops it).
        isin: asset.isin,
        name: asset.name,
        asset_class: asset.asset_class,
        quantity: position.quantity.toString(),
        cost_eur: cents(costOf(state, position.asset_id, position.quantity)),
        value_eur: cents(positionValueOf(price, position.quantity)),
        price: priceOf(price),
      };
    })
    .sort(byAccountThenAsset);
  const held = bucketPositions(state, date, settings, external);
  const bucket: PositionRow[] = held.rows
    .map((row) => {
      const asset = state.assets.get(row.asset_id) as Asset;
      return {
        account_id: row.account_id,
        asset_id: row.asset_id,
        isin: asset.isin,
        name: asset.name,
        quantity: row.quantity.toString(),
        cost_eur: cents(row.cost_eur),
        value_eur: cents(row.value_eur),
        price: priceOf(row.price),
      };
    })
    .sort(byAccountThenAsset);
  const worth = netWorth(state, date, settings, external);
  const cash: CashRow[] = worth.cash.rows
    .map((row) => ({
      account_id: row.account_id,
      // The cash of an account of the catalogue: the projection refuses any other.
      book: (state.accounts.get(row.account_id) as Account).book,
      currency: row.currency,
      amount: row.balance.centsText(),
      value_eur: cents(row.value_eur),
    }))
    .sort((a, b) =>
      a.account_id === b.account_id
        ? a.currency.localeCompare(b.currency)
        : a.account_id.localeCompare(b.account_id),
    );
  const warnings = [
    ...new Set(
      [...weights.warnings, ...held.warnings, ...worth.warnings].map((warning) => warning.code),
    ),
  ].sort();
  return {
    positions_format: POSITIONS_FORMAT,
    as_of: date,
    generated_at: input.generatedAt,
    ledger: input.ledger,
    note: "Informativo. Valores con el último precio conocido; nunca una cifra fiscal.",
    core,
    bucket,
    cash,
    totals: {
      core: { eur: worth.core.total_eur.centsText(), partial: worth.core.partial },
      bucket: { eur: worth.bucket.total_eur.centsText(), partial: worth.bucket.partial },
      cash: { eur: worth.cash.total_eur.centsText(), partial: worth.cash.partial },
    },
    warnings,
  };
};

/** Indented by two spaces, one closing line: a dump is read by hand. */
export const serializePositions = (document: PositionsDocument): string =>
  `${JSON.stringify(document, null, 2)}\n`;
