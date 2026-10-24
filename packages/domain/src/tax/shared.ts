import type { Warning } from "../projections/state.js";

/** The key of a transmission line: its event and its account. */
export const lineKey = (line: { event_id: string; account_id: string }): string =>
  `${line.event_id}|${line.account_id}`;

/**
 * `items` by a key that tells apart the several sales one event makes in one
 * account: `baseOf` plus the order among the items that share it. A
 * restructuring can sell the same asset more than once, and a map keyed by
 * `lineKey` alone keeps only the last of them.
 */
export const keyedByOrder = <T>(
  items: readonly T[],
  baseOf: (item: T) => string,
): Map<string, T> => {
  const seen = new Map<string, number>();
  return new Map(
    items.map((item) => {
      const base = baseOf(item);
      const nth = seen.get(base) ?? 0;
      seen.set(base, nth + 1);
      return [`${base}|${nth}`, item];
    }),
  );
};

/** The key of a sale: its event, account and asset (`keyedByOrder` adds the order). */
export const saleKey = (sale: { event_id: string; account_id: string; asset_id: string }): string =>
  `${lineKey(sale)}|${sale.asset_id}`;

/** The lines of a report by `saleKey` and order. */
export const linesByKey = <T extends { event_id: string; account_id: string; asset_id: string }>(
  lines: readonly T[],
): Map<string, T> => keyedByOrder(lines, saleKey);

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
