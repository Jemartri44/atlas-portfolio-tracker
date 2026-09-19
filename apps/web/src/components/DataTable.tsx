// **One data source, two presentations** (docs/design/system.md §5.3–5.4): a
// list of rows in two lines under 1024px and a dense native table from there
// up, switched by CSS. Never a row of three or four columns squeezed into a
// phone, and never a sideways scrollbar.
//
// On a phone each row is: an optional round icon; the thing the row is about
// with, under it, what kind of thing and where; and on the right the figure
// that matters with, under it, a date or a second figure. The table shows the
// same columns in full.
//
// The table is a native `<table>` on purpose (ADR-0017): sorting and grouping
// live in `@atlas/domain`, so what is left here is markup.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Icon, type IconName } from "./Icon.jsx";

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
}

interface DataTableProps<R> {
  /** Accessible name of the table and of the list: they are the same data. */
  label: string;
  columns: readonly DataColumn<R>[];
  rows: readonly R[];
  /**
   * Makes the whole **row** of the list a link. The table does not wrap
   * anything: a cell that should lead somewhere renders its own `<A>`, because
   * only the caller knows which part of the cell is the link.
   */
  href?: (row: R) => string;
  /** Extra classes on the row, for a state the cells do not carry (struck through, …). */
  rowClass?: (row: R) => string | undefined;
  /** The round icon that opens a row of the list, when rows are of different kinds. */
  lead?: (row: R) => IconName | undefined;
  /**
   * A block under the row, for what belongs to it and does not fit in a cell:
   * the thesis of a position. On the table it goes in a row of its own.
   */
  detail?: (row: R) => JSX.Element;
}

const slot = <R,>(columns: readonly DataColumn<R>[], which: CardSlot): DataColumn<R>[] =>
  columns.filter((column) => column.card === which);

/** The content of a phone cell: its own rendering when it has one, else the table's. */
const onCard = <R,>(column: DataColumn<R>, row: R): JSX.Element =>
  (column.cardCell ?? column.cell)(row);

const RowBody = <R,>(props: {
  columns: readonly DataColumn<R>[];
  row: R;
  lead?: IconName | undefined;
  detail?: ((row: R) => JSX.Element) | undefined;
}): JSX.Element => (
  <>
    <Show when={props.lead}>
      {(name) => (
        <span class="lead" aria-hidden="true">
          <Icon name={name()} />
        </span>
      )}
    </Show>
    <span class="main">
      <For each={slot(props.columns, "title")}>
        {(column) => (
          <span class="title truncate" title={column.hint?.(props.row)}>
            {onCard(column, props.row)}
          </span>
        )}
      </For>
      <Show when={slot(props.columns, "sub").length + slot(props.columns, "meta").length > 0}>
        <span class="sub">
          <For each={slot(props.columns, "sub")}>
            {(column) => (
              <span class="truncate" title={column.hint?.(props.row)}>
                {onCard(column, props.row)}
              </span>
            )}
          </For>
          <For each={slot(props.columns, "meta")}>{(column) => onCard(column, props.row)}</For>
        </span>
      </Show>
    </span>
    <Show when={slot(props.columns, "figure").length + slot(props.columns, "figureSub").length > 0}>
      <span class="figs">
        <For each={slot(props.columns, "figure")}>
          {(column) => <span class="fig">{onCard(column, props.row)}</span>}
        </For>
        <For each={slot(props.columns, "figureSub")}>
          {(column) => <span class="fig-sub">{onCard(column, props.row)}</span>}
        </For>
      </span>
    </Show>
    <Show when={props.detail !== undefined}>
      <span class="row-extra">{(props.detail as (row: R) => JSX.Element)(props.row)}</span>
    </Show>
  </>
);

export const DataTable = <R,>(props: DataTableProps<R>): JSX.Element => {
  /** The classes of a row: its own, the one for a leading icon, and the caller's. */
  const classOf = (row: R, base: string, withLead: string): string =>
    [base, props.lead?.(row) === undefined ? undefined : withLead, props.rowClass?.(row)]
      .filter((name) => name !== undefined && name !== "")
      .join(" ");

  return (
    <>
      {/*
        Phone: a row in two lines; the whole row is the target when it leads
        somewhere. A real `<ul>`: at this width the table is hidden, so this is
        the only thing a screen reader has, and a list says how many rows there
        are.
      */}
      <ul class="rows only-narrow" aria-label={props.label}>
        <For each={props.rows}>
          {(row) => (
            <li>
              <Show
                when={props.href !== undefined}
                fallback={
                  <div class={classOf(row, "row", "has-lead")}>
                    <RowBody
                      columns={props.columns}
                      row={row}
                      lead={props.lead?.(row)}
                      detail={props.detail}
                    />
                  </div>
                }
              >
                <A
                  href={(props.href as (row: R) => string)(row)}
                  class={classOf(row, "row", "has-lead")}
                >
                  <RowBody
                    columns={props.columns}
                    row={row}
                    lead={props.lead?.(row)}
                    detail={props.detail}
                  />
                </A>
              </Show>
            </li>
          )}
        </For>
      </ul>

      {/* Desktop: the same rows, dense. */}
      <table class="table only-wide" aria-label={props.label}>
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
                          <span class="cell-trunc" title={column.hint?.(row)}>
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
