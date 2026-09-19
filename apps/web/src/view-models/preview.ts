// The effect of an event, reduced to **what changes**.
//
// `previewEvent` hands back every position and every lot of the assets the
// event touches, before and after. Painted as they come, a purchase of a fund
// listed its twenty-seven lots — twenty-five of them "4,7186 → 4,7186" — with
// the one that mattered, the new lot, at the very bottom of a phone screen.
// Here the rows that do not move are counted instead of listed, and what is
// new comes first, because it is what the user came to check.

import type { EventPreview, FiscalLot, Money, PhysicalPosition, Quantity } from "@atlas/domain";
import { formatDate } from "../format/date.js";
import { displayName, type NameIndex, NO_NAMES } from "../format/names.js";

export interface ChangeRow {
  key: string;
  label: string;
  /** Quantities, never strings: they go through `Amount` and the privacy mode. */
  before?: Quantity | undefined;
  after?: Quantity | undefined;
  /** It did not exist before the event. */
  isNew: boolean;
  /** A lot the event closes. */
  closed: boolean;
}

/** The cash of one account in one currency, before and after: amounts, so the mask covers them. */
export interface CashRow {
  key: string;
  label: string;
  before: Money;
  after: Money;
  /** The balance ends below zero: said with a word, not only a sign. */
  short: boolean;
}

export interface PreviewChanges {
  positions: ChangeRow[];
  /** Only the accounts and currencies whose balance moves (`previewEvent`). */
  cash: CashRow[];
  unchangedPositions: number;
  lots: ChangeRow[];
  unchangedLots: number;
}

const same = (before?: Quantity, after?: Quantity): boolean =>
  before !== undefined && after !== undefined && before.eq(after);

/** New rows first, then the ones that move; the order of the ledger inside each group. */
const newFirst = (rows: ChangeRow[]): ChangeRow[] => [
  ...rows.filter((row) => row.isNew),
  ...rows.filter((row) => !row.isNew),
];

const positionKey = (row: PhysicalPosition): string => `${row.account_id}|${row.asset_id}`;

export const previewChanges = (
  preview: Pick<EventPreview, "before" | "after"> & Partial<Pick<EventPreview, "cash">>,
  names: NameIndex = NO_NAMES,
): PreviewChanges => {
  const positions = new Map<string, ChangeRow>();
  for (const row of [...preview.before.positions, ...preview.after.positions]) {
    const key = positionKey(row);
    const before = preview.before.positions.find((other) => positionKey(other) === key);
    const after = preview.after.positions.find((other) => positionKey(other) === key);
    positions.set(key, {
      key,
      label: `${displayName(names, row.asset_id)} · ${displayName(names, row.account_id)}`,
      before: before?.quantity,
      after: after?.quantity,
      isNew: before === undefined,
      closed: false,
    });
  }

  const lots = new Map<string, ChangeRow>();
  const lotOf = (list: readonly FiscalLot[], id: string) => list.find((lot) => lot.id === id);
  for (const lot of [...preview.before.lots, ...preview.after.lots]) {
    const before = lotOf(preview.before.lots, lot.id);
    const after = lotOf(preview.after.lots, lot.id);
    lots.set(lot.id, {
      key: lot.id,
      label: `${displayName(names, lot.asset_id)} · adquirido el ${formatDate(lot.acquisition_date)}`,
      before: before?.quantity,
      after: after?.quantity,
      isNew: before === undefined,
      closed: after?.closed === true && before?.closed !== true,
    });
  }

  const moved = (row: ChangeRow): boolean => row.closed || !same(row.before, row.after);
  const positionRows = [...positions.values()];
  const lotRows = [...lots.values()];
  return {
    positions: newFirst(positionRows.filter(moved)),
    cash: (preview.cash ?? []).map((row) => ({
      key: `${row.account_id}|${row.currency}`,
      label: `${displayName(names, row.account_id)} · ${row.currency}`,
      before: row.before,
      after: row.after,
      short: row.after.isNegative(),
    })),
    unchangedPositions: positionRows.filter((row) => !moved(row)).length,
    lots: newFirst(lotRows.filter(moved)),
    unchangedLots: lotRows.filter((row) => !moved(row)).length,
  };
};
