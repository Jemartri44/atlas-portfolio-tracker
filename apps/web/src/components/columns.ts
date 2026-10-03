// The columns of a table, with the privacy mode in mind (feature 020, E3, M9).
//
// With the mode on, the columns that would only hold masks are fused into one,
// "importes ocultos", and the percentages that stand for them go in front. It
// is a **shape** of the table and not a second way of deciding what is hidden:
// the decision is still `Amount`'s, and the fused cell is the cell of one of
// the columns it replaces, so what paints the mask is the same component. With
// the mode off the table is the one it always was.

import type { JSX } from "solid-js";

/**
 * Where a column goes on a phone:
 *
 * - `title`     — first line, the thing the row is about;
 * - `sub`       — second line, what kind of thing and where;
 * - `meta`      — second line too, after `sub`: a tag, a state;
 * - `figure`    — first line on the right, the number that matters;
 * - `figureSub` — second line on the right: a date, a second figure;
 * - omitted     — the column exists only in the table.
 */
export type CardSlot = "title" | "meta" | "figure" | "figureSub" | "sub";

export interface DataColumn<R> {
  key: string;
  header: string;
  /** Right-aligned and tabular: a column of figures reads down, not across. */
  numeric?: boolean;
  cell: (row: R) => JSX.Element;
  /** The same value on a phone row, when it needs less chrome than in the table. */
  cardCell?: (row: R) => JSX.Element;
  card?: CardSlot;
  /** Text for the `title` attribute of the cell, when it can be truncated. */
  hint?: (row: R) => string | undefined;
  /**
   * A column that is only an amount or a quantity, which `Amount` masks. With
   * `maskedMerge` and the mode on, all of them fuse into one column; the one
   * marked `"lead"` (the first, when none is) is the one whose cell stays.
   */
  amount?: boolean | "lead";
  /**
   * A column that exists **only** with the mode on: the percentage that stands
   * for an amount that is hidden. It goes in front of the fused column, and on
   * a phone it takes the slot of the amounts it stands for.
   */
  whenMasked?: boolean;
}

/** The columns of the **table**: the amounts fused after the rest, the percentages in front. */
export const tableColumns = <R>(
  columns: readonly DataColumn<R>[],
  privacy: boolean,
  header: string,
): DataColumn<R>[] => {
  if (!privacy) {
    return columns.filter((column) => column.whenMasked !== true);
  }
  const amounts = columns.filter(
    (column) => column.amount !== undefined && column.amount !== false,
  );
  const lead = amounts.find((column) => column.amount === "lead") ?? amounts[0];
  if (lead === undefined) {
    return [...columns];
  }
  const plain = columns.filter((column) => !amounts.includes(column) && column.whenMasked !== true);
  const standing = columns.filter((column) => column.whenMasked === true);
  return [...plain, ...standing, { key: "hidden", header, numeric: true, cell: lead.cell }];
};

/** The columns of the **rows of a phone**: the percentages take the slot of the amounts they replace. */
export const rowColumns = <R>(
  columns: readonly DataColumn<R>[],
  privacy: boolean,
): DataColumn<R>[] => {
  if (!privacy) {
    return columns.filter((column) => column.whenMasked !== true);
  }
  const claimed = new Set(
    columns
      .filter((column) => column.whenMasked === true && column.card !== undefined)
      .map((column) => column.card),
  );
  return columns.filter((column) =>
    column.whenMasked === true
      ? column.card !== undefined
      : !(column.amount !== undefined && column.amount !== false && claimed.has(column.card)),
  );
};
