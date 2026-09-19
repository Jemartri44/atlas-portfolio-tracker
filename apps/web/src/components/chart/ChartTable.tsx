// The textual equivalent of a chart, which is not a courtesy: a `<canvas>` is
// opaque to a screen reader, and the shape of a line is not a number anybody
// can read off it (FR-028).
//
// It is folded by default — the chart is the quick answer and the table is the
// exact one — and it is painted by `DataTable`, like every other list of rows in
// the application. Writing its own `<table>` was a fourth copy of a layout that
// exists to be shared.

import { Money } from "@atlas/domain";
import { type JSX, Show } from "solid-js";
import { formatDate } from "../../format/date.js";
import { Amount } from "../Amount.jsx";
import { type DataColumn, DataTable } from "../DataTable.jsx";
import { Disclosure } from "../Disclosure.jsx";

export interface ChartTableRow {
  date: string;
  /** One entry per series, in the same order; `undefined` is a hole. */
  values: readonly (string | undefined)[];
}

interface ChartTableProps {
  /** Names of the series, in the order the rows carry their values. */
  headers: readonly string[];
  rows: readonly ChartTableRow[];
  /** What is missing and why, said once under the chart. */
  missing?: string | undefined;
  caption: string;
}

/** The figure of one series on a row, or the hole where it is not known. */
const amountOf = (row: ChartTableRow, index: number): JSX.Element => (
  <Amount
    value={
      row.values[index] === undefined ? undefined : Money.parse(row.values[index] as string, "EUR")
    }
    missingReason="falta algún precio a esa fecha"
  />
);

/**
 * A column per series, plus the date. The figures go through `Amount`.
 *
 * On a phone every series gets **its own line with its own name**. The obvious
 * thing — the first series as the card's figure and the rest as `meta` — put
 * three bare numbers on one line, in an order that did not even match the
 * table's, with nothing saying which was the core and which the cash. On a
 * table the header says it; on a card there is no header, so the card has to.
 */
const columnsOf = (headers: readonly string[]): DataColumn<ChartTableRow>[] => [
  {
    key: "date",
    header: "Fecha",
    card: "title",
    cell: (row) => formatDate(row.date),
  },
  ...headers.map((header, index) => ({
    key: `s${index}`,
    header,
    numeric: true,
    card: "sub" as const,
    cell: (row: ChartTableRow) => amountOf(row, index),
    cardCell: (row: ChartTableRow) => (
      <>
        {header} {amountOf(row, index)}
      </>
    ),
  })),
];

export const ChartTable = (props: ChartTableProps): JSX.Element => (
  <>
    <Show when={props.missing !== undefined}>
      <p class="note">{props.missing}</p>
    </Show>
    <Disclosure label="Ver los datos de la gráfica">
      <DataTable label={props.caption} columns={columnsOf(props.headers)} rows={props.rows} />
    </Disclosure>
  </>
);
