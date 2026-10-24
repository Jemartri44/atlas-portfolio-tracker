import type { Warning } from "../projections/state.js";

/** The key of a transmission line: its event and its account. */
export const lineKey = (line: { event_id: string; account_id: string }): string =>
  `${line.event_id}|${line.account_id}`;

/**
 * The lines of a report by a key that tells apart the several sales one event
 * makes in one account (a restructuring can sell the same asset twice, or two
 * assets): comparing two readings by `lineKey` would keep only the last of
 * them and the comparison would miss a change in the others.
 */
export const linesByKey = <T extends { event_id: string; account_id: string; asset_id: string }>(
  lines: readonly T[],
): Map<string, T> => {
  const seen = new Map<string, number>();
  return new Map(
    lines.map((line) => {
      const base = `${lineKey(line)}|${line.asset_id}`;
      const nth = seen.get(base) ?? 0;
      seen.set(base, nth + 1);
      return [`${base}|${nth}`, line];
    }),
  );
};

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
