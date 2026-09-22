// The rows of the ledger (docs/design/system.md §7.3): on a phone, grouped by
// day, each movement a row in two lines with the glyph of its type; from
// 1024px, the dense table. What is genuinely about a movement — which figure
// matters, what a reversed row looks like — lives in `MovementLine`.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { type DataColumn, DataTable } from "../../components/index.js";
import { formatDate, formatLongDate } from "../../format/date.js";
import type { MovementRow } from "../../view-models/index.js";
import { MovementFigure, MovementLine, MovementState } from "./MovementLine.jsx";

const COLUMNS: readonly DataColumn<MovementRow>[] = [
  {
    key: "date",
    header: "Fecha",
    cell: (row) => (
      <>
        <A href={`/movimientos/${row.id}`}>{formatDate(row.date)}</A>
        <Show when={row.administrative}>
          <span class="meta" title="Fecha de registro: este tipo no tiene fecha de negocio">
            {" "}
            (registro)
          </span>
        </Show>
      </>
    ),
  },
  { key: "type", header: "Tipo", cell: (row) => row.typeLabel },
  {
    key: "subject",
    header: "Cuenta y activo",
    cell: (row) => row.subtitle,
    hint: (row) => row.subtitle,
  },
  {
    key: "status",
    header: "Estado",
    cell: (row) => (
      <Show when={row.status !== "current" || row.invalidReason !== undefined}>
        <MovementState row={row} />
      </Show>
    ),
  },
  {
    key: "figure",
    header: "Importe o cantidad",
    numeric: true,
    cell: (row) => <MovementFigure row={row} />,
  },
];

interface Day {
  date: string;
  rows: MovementRow[];
}

/** Consecutive rows of the same date, in the order the domain gave them. */
export const byDay = (rows: readonly MovementRow[]): Day[] => {
  const days: Day[] = [];
  for (const row of rows) {
    const last = days[days.length - 1];
    if (last?.date === row.date) {
      last.rows.push(row);
    } else {
      days.push({ date: row.date, rows: [row] });
    }
  }
  return days;
};

export const MovementList = (props: { rows: readonly MovementRow[] }): JSX.Element => (
  <>
    <div class="days only-narrow">
      <For each={byDay(props.rows)}>
        {(day) => (
          <section class="day" aria-label={formatLongDate(day.date)}>
            <h2 class="day-title">{formatLongDate(day.date)}</h2>
            <ul class="rows">
              <For each={day.rows}>
                {(row) => (
                  <li>
                    <MovementLine row={row} dated={false} />
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </For>
    </div>
    <DataTable
      label="Movimientos"
      columns={COLUMNS}
      rows={props.rows}
      tableOnly
      rowClass={(row) => (row.status === "reversed" ? "is-reversed" : undefined)}
    />
  </>
);
