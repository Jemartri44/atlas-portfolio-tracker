// Bucket theses (data-schema.md §6.4, business-rules.md rules 13-19,
// constitution III). Theses have no business date: they are applied in file
// order after the catalogue, and "before opening the position" means earlier
// in the file. Everything derived here needs no price; result_vs_index and the
// latent P&L arrive with phase 3.
//
// A thesis is an **administrative document**, not a business fact, so a view
// asked for a past date cuts it by its administrative dates (data-schema.md
// §7): it exists when `opened_at` is on or before the date, and it is closed
// only when `closed_at` is too. Pass A is complete by design (ADR-0016), so
// without this cut a view of June would list the theses of December and count
// as closed what had not been decided yet.

import type { CivilDate } from "../dates/civil-date.js";
import { daysBetween } from "../dates/civil-date.js";
import { madridDateOf } from "../dates/madrid.js";
import { ProjectionError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import { Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import type { AccountId, AssetId, ThesisClosedEvent, ThesisOpenedEvent } from "../schema/events.js";
import { requireAccount, requireAsset } from "./catalogue.js";
import { positionOf } from "./positions.js";
import {
  addWarning,
  type FiscalLot,
  type GainByLot,
  type LedgerState,
  type Thesis,
  type ThesisLeg,
  type ThesisView,
  type UnlinkedLegs,
} from "./state.js";

/** A thesis exists at a date when its opening was recorded on or before it. */
const existsAt = (thesis: Thesis, at: CivilDate): boolean => thesis.opened_at <= at;

/** Closed at a date only when its closing was recorded on or before it. */
const isClosedAt = (thesis: Thesis, at: CivilDate): boolean =>
  thesis.closed_at !== undefined && thesis.closed_at <= at;

/**
 * The thesis open on a (account, asset) pair, if any. With `at`, open means
 * open **on that date**: opened on or before it and not yet closed. Without it,
 * open means open at the end of the ledger, which is what the projection needs
 * while it is still applying events and has no date to answer for.
 */
export const openThesisOn = (
  state: LedgerState,
  accountId: AccountId,
  assetId: AssetId,
  at?: CivilDate,
): Thesis | undefined => {
  for (const thesis of state.theses.values()) {
    if (thesis.account_id !== accountId || thesis.asset_id !== assetId) {
      continue;
    }
    const open =
      at === undefined ? thesis.status === "open" : existsAt(thesis, at) && !isClosedAt(thesis, at);
    if (open) {
      return thesis;
    }
  }
  return undefined;
};

export const applyThesisOpened = (
  state: LedgerState,
  event: ThesisOpenedEvent,
  position: number,
): void => {
  const account = requireAccount(state, event.account_id, event.id);
  const asset = requireAsset(state, event.asset_id, event.id);
  if (account.book !== "bucket" || asset.book !== "bucket") {
    throw new ProjectionError(
      "not_bucket",
      event.id,
      `a thesis needs a bucket account and a bucket asset (${account.account_id}: ${account.book}, ${asset.asset_id}: ${asset.book})`,
      { account_id: account.account_id, asset_id: asset.asset_id },
    );
  }
  if (state.theses.has(event.thesis_id)) {
    throw new ProjectionError(
      "duplicate_thesis",
      event.id,
      `thesis ${event.thesis_id} already exists`,
      { thesis_id: event.thesis_id },
    );
  }
  const open = openThesisOn(state, event.account_id, event.asset_id);
  if (open !== undefined) {
    throw new ProjectionError(
      "thesis_already_open",
      event.id,
      `thesis ${open.thesis_id} is still open on ${event.asset_id} in ${event.account_id}`,
      { thesis_id: open.thesis_id, account_id: event.account_id, asset_id: event.asset_id },
    );
  }
  state.theses.set(event.thesis_id, {
    thesis_id: event.thesis_id,
    account_id: event.account_id,
    asset_id: event.asset_id,
    hypothesis: event.hypothesis,
    expected_horizon_days: event.expected_horizon_days,
    invalidation: event.invalidation,
    planned_size_eur: Money.parse(event.planned_size_eur, "EUR"),
    status: "open",
    opened_event_id: event.id,
    opened_position: position,
    opened_at: madridDateOf(event.recorded_at),
    buys: [],
    sells: [],
    quantity_bought: Quantity.ZERO,
    quantity_sold: Quantity.ZERO,
    invested_eur: Money.zero("EUR"),
    fees_eur: Money.zero("EUR"),
    result_eur: Money.zero("EUR"),
  });
};

const requireThesis = (state: LedgerState, thesisId: string, eventId: Ulid): Thesis => {
  const thesis = state.theses.get(thesisId);
  if (thesis === undefined) {
    throw new ProjectionError("unknown_thesis", eventId, `thesis ${thesisId} does not exist`, {
      thesis_id: thesisId,
    });
  }
  return thesis;
};

export const applyThesisClosed = (
  state: LedgerState,
  event: ThesisClosedEvent,
  position: number,
): void => {
  const thesis = requireThesis(state, event.thesis_id, event.id);
  if (thesis.status === "closed") {
    throw new ProjectionError(
      "thesis_already_closed",
      event.id,
      `thesis ${event.thesis_id} is already closed`,
      { thesis_id: event.thesis_id, closed_by: thesis.closed_event_id },
    );
  }
  thesis.status = "closed";
  thesis.closed_event_id = event.id;
  thesis.closed_position = position;
  thesis.closed_at = madridDateOf(event.recorded_at);
  thesis.closing_notes = event.closing_notes;
};

/**
 * The thesis a bucket buy/sell links to: same account and asset, opened before
 * the operation in the file and not closed before it. `logicalPosition` is the
 * operation's file position, or that of the event it corrects.
 */
export const requireOpenThesis = (
  state: LedgerState,
  thesisId: string,
  accountId: AccountId,
  assetId: AssetId,
  logicalPosition: number,
  eventId: Ulid,
): Thesis => {
  const thesis = requireThesis(state, thesisId, eventId);
  if (thesis.account_id !== accountId || thesis.asset_id !== assetId) {
    throw new ProjectionError(
      "thesis_mismatch",
      eventId,
      `thesis ${thesisId} is about ${thesis.asset_id} in ${thesis.account_id}`,
      { thesis_id: thesisId, account_id: thesis.account_id, asset_id: thesis.asset_id },
    );
  }
  const openedBefore = thesis.opened_position < logicalPosition;
  const closedBefore =
    thesis.closed_position !== undefined && thesis.closed_position < logicalPosition;
  if (!openedBefore || closedBefore) {
    throw new ProjectionError(
      "thesis_not_open",
      eventId,
      `thesis ${thesisId} is not open at this point of the ledger (open it first)`,
      { thesis_id: thesisId, opened_before: openedBefore, closed_before: closedBefore },
    );
  }
  return thesis;
};

export const linkBuy = (
  state: LedgerState,
  thesis: Thesis,
  eventId: Ulid,
  fiscalDate: CivilDate,
  quantity: Quantity,
  costEur: Money,
  feeEur: Money,
): void => {
  thesis.buys.push({
    event_id: eventId,
    fiscal_date: fiscalDate,
    quantity,
    amount_eur: costEur,
    fee_eur: feeEur,
  });
  thesis.quantity_bought = thesis.quantity_bought.add(quantity);
  thesis.invested_eur = thesis.invested_eur.add(costEur);
  thesis.fees_eur = thesis.fees_eur.add(feeEur);
  if (thesis.invested_eur.cmp(thesis.planned_size_eur) > 0) {
    addWarning(
      state,
      "thesis_size_exceeded",
      eventId,
      `thesis ${thesis.thesis_id} has ${thesis.invested_eur.amount.toString()} EUR invested, above the planned ${thesis.planned_size_eur.amount.toString()} EUR`,
      {
        thesis_id: thesis.thesis_id,
        invested_eur: thesis.invested_eur.amount.toString(),
        planned_size_eur: thesis.planned_size_eur.amount.toString(),
      },
    );
  }
};

const unlinkedOf = (state: LedgerState, accountId: AccountId, assetId: AssetId): UnlinkedLegs => {
  const key = `${accountId}|${assetId}`;
  let legs = state.unlinked.get(key);
  if (legs === undefined) {
    legs = {
      account_id: accountId,
      asset_id: assetId,
      buys: [],
      sells: [],
      invested_eur: Money.zero("EUR"),
      fees_eur: Money.zero("EUR"),
      result_eur: Money.zero("EUR"),
    };
    state.unlinked.set(key, legs);
  }
  return legs;
};

/**
 * The part of a disposal that came out of lots no thesis bought, by lineage:
 * what rule 16 must still see as a sale when the operation links to a thesis
 * for what it receives (a swap). Absent when every lot was a thesis's.
 */
export const unthesisedPart = (
  state: LedgerState,
  by_lot: readonly GainByLot[],
): { quantity: Quantity; proceeds_eur: Money; gain_eur: Money } | undefined => {
  const lots = new Map<string, FiscalLot>();
  for (const entry of state.lots.values()) {
    for (const lot of [...entry.open, ...entry.closed]) {
      lots.set(lot.id, lot);
    }
  }
  const thesisBuys = new Set<string>();
  for (const thesis of state.theses.values()) {
    for (const leg of thesis.buys) {
      thesisBuys.add(leg.event_id);
    }
  }
  let part: { quantity: Quantity; proceeds_eur: Money; gain_eur: Money } | undefined;
  for (const slice of by_lot) {
    let root = lots.get(slice.lot_id) as FiscalLot;
    while (root.source_lot_id !== undefined) {
      root = lots.get(root.source_lot_id) as FiscalLot;
    }
    if (!thesisBuys.has(root.source_event_id)) {
      part = {
        quantity: (part?.quantity ?? Quantity.ZERO).add(slice.quantity),
        proceeds_eur: (part?.proceeds_eur ?? Money.zero("EUR")).add(slice.proceeds_eur),
        gain_eur: (part?.gain_eur ?? Money.zero("EUR")).add(slice.gain_eur),
      };
    }
  }
  return part;
};

/** A bucket purchase with no thesis: kept apart so rule 16 still sees it. */
export const linkUnlinkedBuy = (
  state: LedgerState,
  accountId: AccountId,
  assetId: AssetId,
  leg: ThesisLeg,
): void => {
  const legs = unlinkedOf(state, accountId, assetId);
  legs.buys.push(leg);
  legs.invested_eur = legs.invested_eur.add(leg.amount_eur);
  legs.fees_eur = legs.fees_eur.add(leg.fee_eur);
};

/** A bucket sale with no thesis. */
export const linkUnlinkedSell = (
  state: LedgerState,
  accountId: AccountId,
  assetId: AssetId,
  leg: ThesisLeg,
): void => {
  const legs = unlinkedOf(state, accountId, assetId);
  legs.sells.push(leg);
  legs.fees_eur = legs.fees_eur.add(leg.fee_eur);
  legs.result_eur = legs.result_eur.add(leg.gain_eur as Money);
};

export const linkSell = (
  thesis: Thesis,
  eventId: Ulid,
  fiscalDate: CivilDate,
  quantity: Quantity,
  proceedsEur: Money,
  gainEur: Money,
  feeEur: Money,
): void => {
  thesis.sells.push({
    event_id: eventId,
    fiscal_date: fiscalDate,
    quantity,
    amount_eur: proceedsEur,
    fee_eur: feeEur,
    gain_eur: gainEur,
  });
  thesis.quantity_sold = thesis.quantity_sold.add(quantity);
  thesis.result_eur = thesis.result_eur.add(gainEur);
  thesis.fees_eur = thesis.fees_eur.add(feeEur);
};

/**
 * After pass B: a closed thesis whose pair still has a position, and no newer
 * open thesis on it.
 *
 * With `asOf`, "closed" and "open" are read **at that date**, like every other
 * view of a thesis. Pass A' applies the theses whole, so without the date a
 * view of September warned that a thesis closed in December "is closed" while
 * the bucket screen, reading the same date, said it was open (ADR-0016).
 */
export const thesisWarnings = (state: LedgerState, asOf?: CivilDate): void => {
  for (const thesis of state.theses.values()) {
    const closed = asOf === undefined ? thesis.status === "closed" : isClosedAt(thesis, asOf);
    if (
      closed &&
      positionOf(state, thesis.account_id, thesis.asset_id).isPositive() &&
      openThesisOn(state, thesis.account_id, thesis.asset_id, asOf) === undefined
    ) {
      addWarning(
        state,
        "thesis_closed_with_position",
        thesis.closed_event_id as Ulid,
        `thesis ${thesis.thesis_id} is closed but ${thesis.account_id} still holds ${thesis.asset_id}`,
        {
          thesis_id: thesis.thesis_id,
          account_id: thesis.account_id,
          asset_id: thesis.asset_id,
          position: positionOf(state, thesis.account_id, thesis.asset_id).toString(),
        },
      );
    }
  }
};

/** A thesis as it stood at a date: a closing later than the date had not happened yet. */
const viewAt = (state: LedgerState, thesis: Thesis, at: CivilDate): ThesisView => {
  const closed = isClosedAt(thesis, at);
  const view = { ...thesis, status: closed ? ("closed" as const) : ("open" as const) };
  if (!closed) {
    delete view.closed_event_id;
    delete view.closed_position;
    delete view.closed_at;
    delete view.closing_notes;
  }
  return {
    ...view,
    result_eur_rounded: thesis.result_eur.roundToCents(),
    position: positionOf(state, thesis.account_id, thesis.asset_id),
    // Never negative: a thesis that did not exist at the date is not in the list.
    days_open: daysBetween(thesis.opened_at, closed ? (thesis.closed_at as CivilDate) : at),
  };
};

/** The theses of the ledger that already existed at `at`, as they stood then. */
export const theses = (state: LedgerState, at: CivilDate): ThesisView[] =>
  [...state.theses.values()]
    .filter((thesis) => existsAt(thesis, at))
    .map((thesis) => viewAt(state, thesis, at));
