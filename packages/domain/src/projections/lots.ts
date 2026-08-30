// Lot inventory and FIFO booking (data-schema.md §8.1, ADR-0009). Lots are
// global per asset; open lots are kept sorted by (acquisition_date, file
// position of the origin event). One `consume` serves sells, transfers and,
// later, corporate actions.

import type { CivilDate } from "../dates/civil-date.js";
import { ProjectionError } from "../errors.js";
import type { Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import type { AssetId } from "../schema/events.js";
import type { AssetLots, FiscalLot, LedgerState } from "./state.js";

export interface NewLot {
  asset_id: AssetId;
  acquisition_date: CivilDate;
  quantity: Quantity;
  cost_eur: Money;
  source_event_id: string;
  position: number;
  source_lot_id?: string;
}

export interface LotSlice {
  lot_id: string;
  acquisition_date: CivilDate;
  /** File position of the origin event of the consumed lot. */
  position: number;
  quantity: Quantity;
  cost_eur: Money;
}

const lotsOf = (state: LedgerState, assetId: AssetId): AssetLots => {
  let entry = state.lots.get(assetId);
  if (entry === undefined) {
    entry = { open: [], closed: [] };
    state.lots.set(assetId, entry);
  }
  return entry;
};

const before = (a: FiscalLot, b: FiscalLot): boolean =>
  a.acquisition_date < b.acquisition_date ||
  (a.acquisition_date === b.acquisition_date && a.position < b.position);

/** Creates a lot and inserts it in FIFO order. Returns its id. */
export const openLot = (state: LedgerState, lot: NewLot): FiscalLot => {
  const entry = lotsOf(state, lot.asset_id);
  const sequence = [...entry.open, ...entry.closed].filter(
    (existing) => existing.source_event_id === lot.source_event_id,
  ).length;
  const created: FiscalLot = {
    id: `${lot.source_event_id}#${sequence}`,
    asset_id: lot.asset_id,
    acquisition_date: lot.acquisition_date,
    original_quantity: lot.quantity,
    quantity: lot.quantity,
    cost_eur: lot.cost_eur,
    original_cost_eur: lot.cost_eur,
    source_event_id: lot.source_event_id,
    ...(lot.source_lot_id === undefined ? {} : { source_lot_id: lot.source_lot_id }),
    position: lot.position,
    closed: false,
    consumptions: [],
  };
  let index = entry.open.length;
  while (index > 0 && before(created, entry.open[index - 1] as FiscalLot)) {
    index -= 1;
  }
  entry.open.splice(index, 0, created);
  return created;
};

/** Consumes `quantity` of the asset in FIFO order. Throws when the open lots do not cover it. */
export const consume = (
  state: LedgerState,
  assetId: AssetId,
  quantity: Quantity,
  eventId: string,
): LotSlice[] => {
  const entry = lotsOf(state, assetId);
  const slices: LotSlice[] = [];
  let remaining = quantity;
  while (remaining.isPositive()) {
    const lot = entry.open[0];
    if (lot === undefined) {
      throw new ProjectionError(
        "insufficient_lots",
        eventId,
        `no open lots of ${assetId} left to cover ${remaining.toString()}`,
        { asset_id: assetId, missing: remaining.toString() },
      );
    }
    const whole = !lot.quantity.gt(remaining);
    const taken = whole ? lot.quantity : remaining;
    const cost = whole ? lot.cost_eur : lot.cost_eur.mul(taken.value).div(lot.quantity.value);
    lot.quantity = lot.quantity.sub(taken);
    lot.cost_eur = lot.cost_eur.sub(cost);
    lot.consumptions.push({ event_id: eventId, quantity: taken, cost_eur: cost });
    if (whole) {
      lot.closed = true;
      entry.open.shift();
      entry.closed.push(lot);
    }
    slices.push({
      lot_id: lot.id,
      acquisition_date: lot.acquisition_date,
      position: lot.position,
      quantity: taken,
      cost_eur: cost,
    });
    remaining = remaining.sub(taken);
  }
  return slices;
};

/** Open quantity of an asset across all accounts. */
export const openQuantity = (state: LedgerState, assetId: AssetId): Quantity =>
  (state.lots.get(assetId)?.open ?? []).reduce(
    (total, lot) => total.add(lot.quantity),
    Quantity.ZERO,
  );

export const fiscalLots = (state: LedgerState, assetId?: AssetId): FiscalLot[] => {
  const result: FiscalLot[] = [];
  for (const [id, entry] of state.lots) {
    if (assetId === undefined || id === assetId) {
      result.push(...entry.open, ...entry.closed);
    }
  }
  return result;
};
