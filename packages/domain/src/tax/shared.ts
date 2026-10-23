import type { Warning } from "../projections/state.js";

/** The key of a transmission line: its event and its account. */
export const lineKey = (line: { event_id: string; account_id: string }): string =>
  `${line.event_id}|${line.account_id}`;

/** A note of the report: a code the interfaces translate, never a figure in disguise. */
export const eventNote = (
  code: string,
  eventId: string,
  message: string,
  details: Record<string, unknown>,
): Warning => ({ code, event_id: eventId, message, details });

/** A note that belongs to no single event. */
export const note = (code: string, message: string, details: Record<string, unknown>): Warning =>
  eventNote(code, "", message, details);
