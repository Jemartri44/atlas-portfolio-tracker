// Bucket theses (data-schema.md §6.4, business-rules.md rules 13-19,
// constitution III). Theses have no business date: they are applied in file
// order after the catalogue, and "before opening the position" means earlier
// in the file. Everything derived here needs no price; result_vs_index and the
// latent P&L arrive with phase 3.

import type { CivilDate } from "../dates/civil-date.js";
import { madridDateOf } from "../dates/madrid.js";
import { ProjectionError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import { Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import type { AccountId, AssetId, ThesisClosedEvent, ThesisOpenedEvent } from "../schema/events.js";
import { requireAccount, requireAsset } from "./catalogue.js";
import { daysBetween } from "./pending.js";
import { positionOf } from "./positions.js";
import { addWarning, type LedgerState, type Thesis, type ThesisView } from "./state.js";

const openThesisOn = (
  state: LedgerState,
  accountId: AccountId,
  assetId: AssetId,
): Thesis | undefined => {
  for (const thesis of state.theses.values()) {
    if (
      thesis.status === "open" &&
      thesis.account_id === accountId &&
      thesis.asset_id === assetId
    ) {
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
      `thesis ${thesisId} is not open at this point of the ledger (rule 15: open it first)`,
      { thesis_id: thesisId, opened_before: openedBefore, closed_before: closedBefore },
    );
  }
  return thesis;
};

export const linkBuy = (
  state: LedgerState,
  thesis: Thesis,
  eventId: Ulid,
  quantity: Quantity,
  costEur: Money,
  feeEur: Money,
): void => {
  thesis.buys.push(eventId);
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

export const linkSell = (
  thesis: Thesis,
  eventId: Ulid,
  quantity: Quantity,
  gainEur: Money,
  feeEur: Money,
): void => {
  thesis.sells.push(eventId);
  thesis.quantity_sold = thesis.quantity_sold.add(quantity);
  thesis.result_eur = thesis.result_eur.add(gainEur);
  thesis.fees_eur = thesis.fees_eur.add(feeEur);
};

/** After pass B: a closed thesis whose pair still has a position, and no newer open thesis on it. */
export const thesisWarnings = (state: LedgerState): void => {
  for (const thesis of state.theses.values()) {
    if (
      thesis.status === "closed" &&
      positionOf(state, thesis.account_id, thesis.asset_id).isPositive() &&
      openThesisOn(state, thesis.account_id, thesis.asset_id) === undefined
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

export const theses = (state: LedgerState, at: CivilDate): ThesisView[] =>
  [...state.theses.values()].map((thesis) => ({
    ...thesis,
    result_eur_rounded: thesis.result_eur.roundToCents(),
    position: positionOf(state, thesis.account_id, thesis.asset_id),
    days_open: daysBetween(thesis.opened_at, thesis.closed_at ?? at),
  }));
