// Transfer simulator (specification §6.1.1, prompt 004 §3.4).
//
// A pure query: it builds no event, touches no lot and writes nothing. It moves
// `quantity × manual price` euros from one core fund to another and shows the
// weights before and after, with the reminder that a transfer between funds is
// not a taxable event (business-rules.md §5.2): it keeps the acquisition date
// and the cost of the original lots.

import type { CivilDate } from "../dates/civil-date.js";
import { ValidationError } from "../errors.js";
import { Decimal } from "../money/decimal.js";
import { Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import type { AssetClass, AssetId } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { manualPrices, type PriceLookup } from "./prices.js";
import type { LedgerState, Warning } from "./state.js";
import {
  type CoreWeightRow,
  type CoreWeights,
  coreWeights,
  deriveWeights,
  sortWeightRows,
} from "./weights.js";

export interface SimulateTransferInput {
  from_asset_id: AssetId;
  to_asset_id: AssetId;
  /** Exactly one of the two: a quantity, or everything held. */
  quantity?: string;
  all?: boolean;
  date: CivilDate;
  settings: Settings;
}

export interface TransferSimulation {
  date: CivilDate;
  from_asset_id: AssetId;
  to_asset_id: AssetId;
  quantity: Quantity;
  /** `quantity × unit_value_eur` of the origin. */
  moved_eur: Money;
  before: CoreWeights;
  after: CoreWeights;
  /** A transfer between funds is never a taxable event (business-rules.md §5.2). */
  taxable: false;
}

const fail = (code: string, message: string, details: Record<string, unknown>): never => {
  throw new ValidationError(code, message, details);
};

/** Checks the asset exists, belongs to the core and can be transferred. */
const requireTransferable = (state: LedgerState, assetId: AssetId, role: string): void => {
  const asset = state.assets.get(assetId);
  if (asset === undefined) {
    fail("unknown_asset", `asset ${assetId} does not exist`, { asset_id: assetId, role });
  }
  if (asset?.book !== "core") {
    fail("not_core_asset", `asset ${assetId} is not in the core book`, { asset_id: assetId, role });
  }
  if (asset?.transferable !== true) {
    fail("not_transferable", `asset ${assetId} is not transferable`, { asset_id: assetId, role });
  }
};

export const simulateTransfer = (
  state: LedgerState,
  input: SimulateTransferInput,
): TransferSimulation => {
  const { from_asset_id, to_asset_id, date, settings } = input;
  if (from_asset_id === to_asset_id) {
    fail("same_asset", "origin and destination must differ", { asset_id: from_asset_id });
  }
  requireTransferable(state, from_asset_id, "from");
  requireTransferable(state, to_asset_id, "to");

  const table = coreWeights(state, date, settings);
  /*
   * A partial core blanks every weight, so simulating over it would print a
   * table of empty cells and explain nothing. The simulator refuses listing
   * what is missing (decision (c) of prompt 004), even when the two assets of
   * the transfer are priced: the weights are computed over the whole core.
   */
  if (table.partial) {
    fail("missing_manual_prices", "some core assets held have no manual price", {
      assets: table.missing_prices,
      date,
    });
  }
  /*
   * Whether a price exists is asked of the prices, not of the table: a
   * destination that is priced but neither held nor in the plan has no row yet
   * (transferring a whole position into a fund before adding it to the plan is
   * legitimate) and must not be refused for a price it does have.
   */
  const prices = manualPrices(state, date, settings);
  const missing = [from_asset_id, to_asset_id].filter((assetId) => !prices.has(assetId));
  if (missing.length > 0) {
    fail("missing_manual_prices", "both assets need a manual price to simulate the transfer", {
      assets: missing,
      date,
    });
  }

  /** An asset outside the table has no position and no target weight (see `universeOf`): it joins it at zero. */
  const zeroRow = (assetId: AssetId): CoreWeightRow => ({
    asset_id: assetId,
    asset_class: state.assets.get(assetId)?.asset_class as AssetClass,
    quantity: Quantity.ZERO,
    price: prices.get(assetId) as PriceLookup,
    value_eur: Money.zero("EUR"),
    target_pct: Decimal.ZERO,
  });
  const rowOf = (rows: readonly CoreWeightRow[], assetId: AssetId) =>
    rows.find((row) => row.asset_id === assetId);
  const extra = [from_asset_id, to_asset_id].filter(
    (assetId) => rowOf(table.rows, assetId) === undefined,
  );
  const widened = sortWeightRows([...table.rows, ...extra.map(zeroRow)]);
  const before: CoreWeights =
    extra.length === 0
      ? table
      : {
          ...table,
          rows: widened,
          // Fresh subtotals for the widened table; its warnings are already in `table`.
          by_class: deriveWeights(widened, table.total_eur, false, settings, []),
        };
  const from = rowOf(before.rows, from_asset_id) as CoreWeightRow;
  const held = from.quantity;
  const quantity = input.all === true ? held : Quantity.parse(input.quantity);
  if (!quantity.isPositive()) {
    fail("invalid_quantity", "the quantity transferred must be greater than zero", {
      value: input.quantity,
    });
  }
  if (quantity.gt(held)) {
    fail("insufficient_position", `the core holds ${held.toString()} of ${from_asset_id}`, {
      asset_id: from_asset_id,
      available: held.toString(),
    });
  }

  const unit = (from.price as PriceLookup).unit_value_eur;
  const moved = Money.of(unit.amount.mul(quantity.value), "EUR");
  const warnings: Warning[] = [];
  const rows = before.rows.map((row) => {
    const value = row.value_eur as Money;
    if (row.asset_id === from_asset_id) {
      return { ...row, value_eur: value.sub(moved) };
    }
    if (row.asset_id === to_asset_id) {
      return { ...row, value_eur: value.add(moved) };
    }
    return { ...row };
  });
  // The total does not change: a transfer moves value, it does not create it.
  const by_class = deriveWeights(rows, before.total_eur, before.partial, settings, warnings);
  return {
    date,
    from_asset_id,
    to_asset_id,
    quantity,
    moved_eur: moved,
    before,
    after: {
      ...before,
      rows,
      by_class,
      warnings,
    },
    taxable: false,
  };
};
