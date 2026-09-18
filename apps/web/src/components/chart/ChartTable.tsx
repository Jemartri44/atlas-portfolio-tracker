// The textual equivalent of a chart, which is not a courtesy: a `<canvas>` is
// opaque to a screen reader, and the shape of a line is not a number anybody
// can read off it (FR-028).
//
// It is folded by default — the chart is the quick answer and the table is the
// exact one — and its figures go through `Amount`, so the privacy mode covers
// them by the same rule as everywhere else.

import { Money } from "@atlas/domain";
import { For, type JSX, Show } from "solid-js";
import { formatDate } from "../../format/date.js";
import { Amount } from "../Amount.jsx";

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

export const ChartTable = (props: ChartTableProps): JSX.Element => (
  <>
    <Show when={props.missing !== undefined}>
      <p class="note">{props.missing}</p>
    </Show>
    <details class="chart-table">
      <summary class="tiny">Ver los datos de la gráfica</summary>
      <table class="datatable is-always">
        <caption class="sr-only">{props.caption}</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <For each={props.headers}>
              {(header) => (
                <th scope="col" class="num">
                  {header}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows}>
            {(row) => (
              <tr>
                <td>{formatDate(row.date)}</td>
                <For each={row.values}>
                  {(value) => (
                    <td class="num">
                      <Amount
                        value={value === undefined ? undefined : Money.parse(value, "EUR")}
                        missingReason="falta algún precio a esa fecha"
                        currency={false}
                      />
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </details>
  </>
);
