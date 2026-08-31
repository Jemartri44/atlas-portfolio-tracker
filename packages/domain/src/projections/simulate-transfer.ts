// Transfer simulator (specification §6.1.1, prompt 004 §3.4).
//
// A pure query: it builds no event, touches no lot and writes nothing. It moves
// `quantity × manual price` euros from one core fund to another and shows the
// weights before and after, with the reminder that a transfer between funds is
// not a taxable event (business-rules.md §5.2): it keeps the acquisition date
// and the cost of the original lots.

import type { CivilDate } from "../dates/civil-date.js";
import { ValidationError } from "../errors.js";
import { Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import type { AssetId } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import type { LedgerState, Warning } from "./state.js";
import { type CoreWeights, coreWeights, deriveWeights } from "./weights.js";

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

  const before = coreWeights(state, date, settings);
  const rowOf = (assetId: AssetId) => before.rows.find((row) => row.asset_id === assetId);
  const from = rowOf(from_asset_id);
  const missing = [from_asset_id, to_asset_id].filter(
    (assetId) => rowOf(assetId)?.price === undefined,
  );
  if (missing.length > 0) {
    fail("missing_manual_prices", "both assets need a manual price to simulate the transfer", {
      assets: missing,
      date,
    });
  }
  const held = from?.quantity ?? Quantity.ZERO;
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

  const unit = from?.price?.unit_value_eur as Money;
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
