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

/** "Compra del 03/09/2026". */
export const describeEvent = (event: LedgerEvent): string =>
  `${eventLabel(event.type)} del ${formatDate(eventDateOf(event))}`;

/** Resolves an event identifier to its description, over the events of one load. */
export type EventReferences = (id: string) => string;

export const eventReferences = (events: readonly LedgerEvent[]): EventReferences => {
  const byId = new Map(events.map((event) => [event.id, event]));
  return (id) => {
    const event = byId.get(id);
    return event === undefined ? "un movimiento que ya no está en el libro" : describeEvent(event);
  };
};
