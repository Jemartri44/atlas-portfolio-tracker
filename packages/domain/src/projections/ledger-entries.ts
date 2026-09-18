// The ledger as a list a person can read (decision (h) of prompt 006).
//
// Ordering and grouping are domain, not interface: it is the reason ADR-0017
// rejected a table library. And the order is not cosmetic — it is the **inverse
// of the projection order** of data-schema.md §7.1 (business date, then file
// position), so what the list shows and what the engine applies cannot disagree.
// Resolving the business date needs `settingsAt` and `fiscalDateOf`, so doing it
// in a component would be a second implementation of a fiscal rule.
//
// Catalogue, settings, theses and reversals have **no** business date (§7.1):
// they are ordered by their administrative date (`recorded_at` in
// Europe/Madrid) and the rule is written here instead of left to chance.
//
// Pagination is deliberately absent: the caller slices. The same list feeds the
// five rows of the summary and the pages of twenty of the movements screen.

import type { CivilDate } from "../dates/civil-date.js";
import { madridDateOf } from "../dates/madrid.js";
import type { Ulid } from "../ids/ulid.js";
import type { AccountId, AssetId, LedgerEvent } from "../schema/events.js";
import { businessDateOf, isOperationEvent } from "./project-ledger.js";
import type { LedgerState } from "./state.js";

/**
 * - `current`: in force.
 * - `reversed`: a `reversal` cancelled it.
 * - `reversal`: it is the cancellation of another event.
 * - `correction`: it replaces an event that was reversed (`corrects_id`).
 */
export type EntryStatus = "current" | "reversed" | "reversal" | "correction";

export interface LedgerEntry {
  event: LedgerEvent;
  /** Position in the file: the canonical storage order. */
  position: number;
  /** Business date, absent for catalogue, settings, theses and reversals. */
  business_date?: CivilDate;
  /** `recorded_at` as a calendar date in Europe/Madrid. */
  recorded_date: CivilDate;
  /** The date this entry is ordered and filtered by: the business one when it has it. */
  sort_date: CivilDate;
  status: EntryStatus;
  /** The reversal that cancelled it. */
  reversed_by?: Ulid;
  /** Present when this event is a reversal. */
  reverses_id?: Ulid;
  /** Present when this event corrects another one. */
  corrects_id?: Ulid;
  /** The later event that corrects this one. */
  corrected_by?: Ulid;
  account_id?: AccountId;
  asset_id?: AssetId;
  order_id?: Ulid;
  request_id?: Ulid;
  thesis_id?: string;
  /** Why the degraded projection rejected it (ADR-0015); absent when it is valid. */
  invalid_reason?: string;
}

export interface EntryFilter {
  /** Event types to keep; empty or absent keeps them all. */
  types?: readonly string[];
  account_id?: AccountId;
  asset_id?: AssetId;
  /** Closed range over `sort_date`. */
  from?: CivilDate;
  to?: CivilDate;
  /** Case-insensitive substring over id, notes, references, account and asset. */
  text?: string;
  /** Reversed events are listed by default; `false` hides them. */
  include_reversed?: boolean;
}

interface Referenced {
  account_id?: AccountId;
  asset_id?: AssetId;
  from_account_id?: AccountId;
  from_asset_id?: AssetId;
  order_id?: Ulid;
  request_id?: Ulid;
  thesis_id?: string;
  notes?: string;
  broker_ref?: string;
  description?: string;
  reason?: string;
  source?: string;
}

/** Text an event can be searched by. Only what a person would type. */
const haystackOf = (entry: LedgerEntry): string => {
  const fields = entry.event as LedgerEvent & Referenced;
  return [
    entry.event.id,
    entry.event.type,
    entry.account_id,
    entry.asset_id,
    entry.order_id,
    entry.request_id,
    entry.thesis_id,
    fields.notes,
    fields.broker_ref,
    fields.description,
    fields.reason,
    fields.source,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
};

const statusOf = (
  event: LedgerEvent,
  reversedBy: Ulid | undefined,
): { status: EntryStatus; corrects_id?: Ulid; reverses_id?: Ulid } => {
  if (event.type === "reversal") {
    return { status: "reversal", reverses_id: event.reverses_id };
  }
  const corrects = (event as { corrects_id?: Ulid }).corrects_id;
  if (reversedBy !== undefined) {
    return { status: "reversed", ...(corrects === undefined ? {} : { corrects_id: corrects }) };
  }
  if (corrects !== undefined) {
    return { status: "correction", corrects_id: corrects };
  }
  return { status: "current" };
};

const entryOf = (
  state: LedgerState,
  event: LedgerEvent,
  position: number,
  invalid: ReadonlyMap<Ulid, string>,
  correctedBy: ReadonlyMap<Ulid, Ulid>,
): LedgerEntry => {
  const fields = event as LedgerEvent & Referenced;
  const businessDate = isOperationEvent(event) ? businessDateOf(state, event) : undefined;
  const recordedDate = madridDateOf(event.recorded_at);
  const reversedBy = state.reversed.get(event.id);
  const reason = invalid.get(event.id);
  const corrected = correctedBy.get(event.id);
  return {
    event,
    position,
    ...(businessDate === undefined ? {} : { business_date: businessDate }),
    recorded_date: recordedDate,
    sort_date: businessDate ?? recordedDate,
    ...statusOf(event, reversedBy),
    ...(reversedBy === undefined ? {} : { reversed_by: reversedBy }),
    ...(corrected === undefined ? {} : { corrected_by: corrected }),
    ...(fields.account_id === undefined
      ? fields.from_account_id === undefined
        ? {}
        : { account_id: fields.from_account_id }
      : { account_id: fields.account_id }),
    ...(fields.asset_id === undefined
      ? fields.from_asset_id === undefined
        ? {}
        : { asset_id: fields.from_asset_id }
      : { asset_id: fields.asset_id }),
    ...(fields.order_id === undefined ? {} : { order_id: fields.order_id }),
    ...(fields.request_id === undefined ? {} : { request_id: fields.request_id }),
    ...(fields.thesis_id === undefined ? {} : { thesis_id: fields.thesis_id }),
    ...(reason === undefined ? {} : { invalid_reason: reason }),
  };
};

const matches = (entry: LedgerEntry, filter: EntryFilter, text: string | undefined): boolean => {
  if (filter.types !== undefined && filter.types.length > 0) {
    if (!filter.types.includes(entry.event.type)) {
      return false;
    }
  }
  if (filter.account_id !== undefined && entry.account_id !== filter.account_id) {
    // A transfer names two accounts: it matches if either of them is the one asked for.
    const to = (entry.event as { to_account_id?: AccountId }).to_account_id;
    if (to !== filter.account_id) {
      return false;
    }
  }
  if (filter.asset_id !== undefined && entry.asset_id !== filter.asset_id) {
    const to = (entry.event as { to_asset_id?: AssetId }).to_asset_id;
    if (to !== filter.asset_id) {
      return false;
    }
  }
  if (filter.from !== undefined && entry.sort_date < filter.from) {
    return false;
  }
  if (filter.to !== undefined && entry.sort_date > filter.to) {
    return false;
  }
  if (filter.include_reversed === false && entry.status === "reversed") {
    return false;
  }
  if (text !== undefined && !haystackOf(entry).includes(text)) {
    return false;
  }
  return true;
};

/**
 * Entries in **reverse** chronological order: business date descending and, on
 * equal dates, file position descending (the inverse of the projection order).
 * `events` must be the whole ledger in file order, as `load` returns it.
 */
export const ledgerEntries = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  filter: EntryFilter = {},
): LedgerEntry[] => {
  const invalid = new Map(state.invalid.map((entry) => [entry.event.id, entry.error.message]));
  const correctedBy = new Map<Ulid, Ulid>();
  for (const event of events) {
    const corrects = (event as { corrects_id?: Ulid }).corrects_id;
    if (corrects !== undefined) {
      correctedBy.set(corrects, event.id);
    }
  }
  const text =
    filter.text === undefined || filter.text === "" ? undefined : filter.text.toLowerCase();
  return events
    .map((event, position) => entryOf(state, event, position, invalid, correctedBy))
    .filter((entry) => matches(entry, filter, text))
    .sort((a, b) =>
      a.sort_date > b.sort_date ? -1 : a.sort_date < b.sort_date ? 1 : b.position - a.position,
    );
};
