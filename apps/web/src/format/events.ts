// An event of the ledger said the way a person points at it: "Compra del
// 03/09/2026", not "01M1PS7N80HK088D7010QSGMEQ".
//
// Identifiers are what the ledger needs to point from one line to another, and
// they are what the application used to print in the links of a movement, in
// the verification screen and in the second line of a reversal. The identifier
// stays available where the ledger is checked — the technical block of a
// movement — and everywhere else an event is named by its type and its date.

import { type LedgerEvent, madridDateOf } from "@atlas/domain";
import { formatDate } from "./date.js";
import { eventLabel } from "./labels.js";
import { displayName, type NameIndex, NO_NAMES } from "./names.js";

/** The date a person associates with the event: its business date, or the day it was recorded. */
const DATE_FIELDS = [
  "trade_date",
  "value_date",
  "date",
  "effective_date",
  "requested_date",
  "value_date_out",
] as const;

export const eventDateOf = (event: LedgerEvent): string => {
  const fields = event as unknown as Record<string, unknown>;
  for (const field of DATE_FIELDS) {
    const value = fields[field];
    if (typeof value === "string") {
      return value;
    }
  }
  return madridDateOf(event.recorded_at);
};

/**
 * "Compra del 03/09/2026". An order is named by what it asked for too —
 * "Orden de compra de World Index Fund del 02/09/2026" —, because a day can
 * hold several and the user remembers them by the asset (review of 2026-09-19).
 */
export const describeEvent = (event: LedgerEvent, names: NameIndex = NO_NAMES): string => {
  const date = formatDate(eventDateOf(event));
  if (event.type === "order_placed") {
    const order = event as unknown as { side?: string; asset_id?: string };
    const kind = order.side === "sell" ? "Orden de venta" : "Orden de compra";
    return `${kind} de ${displayName(names, order.asset_id)} del ${date}`;
  }
  return `${eventLabel(event.type)} del ${date}`;
};

/**
 * A reference said inside a sentence: «Anulaste valoración del 31/12/2026»,
 * not «Anulaste Valoración…» (final pass of the review of 2026-09-19). Only
 * the first letter, which is always the type's — a common noun — so the name of
 * an asset further on keeps its capitals, where `toLowerCase` wrote «world
 * index fund».
 */
export const inSentence = (reference: string): string =>
  reference.charAt(0).toLowerCase() + reference.slice(1);

/** Resolves an event identifier to its description, over the events of one load. */
export type EventReferences = (id: string) => string;

export const eventReferences = (
  events: readonly LedgerEvent[],
  names: NameIndex = NO_NAMES,
): EventReferences => {
  const byId = new Map(events.map((event) => [event.id, event]));
  return (id) => {
    const event = byId.get(id);
    return event === undefined
      ? "un movimiento que ya no está en tus datos"
      : describeEvent(event, names);
  };
};
