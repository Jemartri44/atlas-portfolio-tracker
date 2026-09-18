// **One data source, two presentations**: cards under 1024px and a dense native
// table from there up, switched by CSS (`styles/components.css`). No sideways
// scrollbar at 360px, which is an acceptance criterion and not an aspiration.
//
// It was the shape of `routes/movimientos/MovementList.tsx`, written by hand for
// one screen. Three more screens need the same thing in feature 007, so it is
// generalised here instead of copied: a near-identical cousin of an existing
// component is debt, not reuse (prompt §3.5).
//
// The table is a native `<table>` on purpose (ADR-0017): sorting and grouping
// live in `@atlas/domain`, which is the written reason TanStack Table was
// rejected, so what is left here is markup.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";

/**
 * Where a column goes on a phone, where there is no room for a table:
 *
 * - `title`  — first line, the thing the row is about;
 * - `meta`   — first line, after the title: a date, a state, a badge;
 * - `figure` — to the right, the number that matters;
 * - `sub`    — second line, truncated, with the full text in `title`;
 * - omitted  — the column exists only in the table.
 */
export type CardSlot = "title" | "meta" | "figure" | "sub";

export interface DataColumn<R> {
  key: string;
  header: string;
  /** Right-aligned and tabular: a column of figures reads down, not across. */
  numeric?: boolean;
  cell: (row: R) => JSX.Element;
  /** The same value on a card, when it needs less chrome than in the table. */
  cardCell?: (row: R) => JSX.Element;
  card?: CardSlot;
  /** Text for the `title` attribute of the cell, when it can be truncated. */
  hint?: (row: R) => string | undefined;
}

interface DataTableProps<R> {
  /** Accessible name of the table and of the list: they are the same data. */
  label: string;
  columns: readonly DataColumn<R>[];
  rows: readonly R[];
  /**
   * Makes the whole **card** a link. The table does not wrap anything: a cell
   * that should lead somewhere renders its own `<A>`, because only the caller
   * knows which part of the cell is the link (the date, not the "(registro)"
   * note beside it).
   */
  href?: (row: R) => string;
  /** Extra classes on the row, for a state the cells do not carry (struck through, …). */
  rowClass?: (row: R) => string | undefined;
  /**
   * A block under the card, for what belongs to the row and does not fit in a
   * cell: the thesis of a position, with its clock and its invalidation
   * condition. On the table it goes in a row of its own, spanning every column,
   * so the two surfaces show the same thing.
   */
  detail?: (row: R) => JSX.Element;
}

const slot = <R,>(columns: readonly DataColumn<R>[], which: CardSlot): DataColumn<R>[] =>
  columns.filter((column) => column.card === which);

/** The content of a card cell: its own rendering when it has one, else the table's. */
const onCard = <R,>(column: DataColumn<R>, row: R): JSX.Element =>
  (column.cardCell ?? column.cell)(row);

const Card = <R,>(props: {
  columns: readonly DataColumn<R>[];
  row: R;
  detail?: ((row: R) => JSX.Element) | undefined;
}): JSX.Element => (
  <>
    <span class="head">
      <For each={slot(props.columns, "title")}>
        {(column) => <span class="title">{onCard(column, props.row)}</span>}
      </For>
      <For each={slot(props.columns, "meta")}>{(column) => onCard(column, props.row)}</For>
    </span>
    <Show when={slot(props.columns, "figure").length > 0}>
      <span class="figure">
        <For each={slot(props.columns, "figure")}>{(column) => onCard(column, props.row)}</For>
      </span>
    </Show>
    <For each={slot(props.columns, "sub")}>
      {(column) => (
        <span class="sub" title={column.hint?.(props.row)}>
          {onCard(column, props.row)}
        </span>
      )}
    </For>
    <Show when={props.detail !== undefined}>
      <span class="extra">{(props.detail as (row: R) => JSX.Element)(props.row)}</span>
    </Show>
  </>
);

export const DataTable = <R,>(props: DataTableProps<R>): JSX.Element => {
  const classOf = (row: R): string => `item ${props.rowClass?.(row) ?? ""}`.trimEnd();

  return (
    <>
      {/*
        Phone: a card per row; the whole card is the target when it leads
        somewhere. A real `<ul>`, not a labelled `<div>`: at this width the table
        is hidden, so this is the only thing a screen reader has, and a list
        announces how many rows there are.
      */}
      <ul class="datalist" aria-label={props.label}>
        <For each={props.rows}>
          {(row) => (
            <li>
              <Show
                when={props.href !== undefined}
                fallback={
                  <div class={classOf(row)}>
                    <Card columns={props.columns} row={row} detail={props.detail} />
                  </div>
                }
              >
                <A href={(props.href as (row: R) => string)(row)} class={classOf(row)}>
                  <Card columns={props.columns} row={row} detail={props.detail} />
                </A>
              </Show>
            </li>
          )}
        </For>
      </ul>

      {/* Desktop: the same rows, dense. */}
      <table class="datatable" aria-label={props.label}>
        <thead>
          <tr>
            <For each={props.columns}>
              {(column) => (
                <th scope="col" class={column.numeric === true ? "num" : undefined}>
                  {column.header}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows}>
            {(row) => (
              <>
                <tr class={props.rowClass?.(row)}>
                  <For each={props.columns}>
                    {(column) => (
                      <td class={column.numeric === true ? "num" : undefined}>
                        <Show when={column.hint?.(row) !== undefined} fallback={column.cell(row)}>
                          <span class="truncate" title={column.hint?.(row)}>
                            {column.cell(row)}
                          </span>
                        </Show>
                      </td>
                    )}
                  </For>
                </tr>
                <Show when={props.detail !== undefined}>
                  <tr class="extra-row">
                    <td colSpan={props.columns.length}>
                      {(props.detail as (row: R) => JSX.Element)(row)}
                    </td>
                  </tr>
                </Show>
              </>
            )}
          </For>
        </tbody>
      </table>
    </>
  );
};
