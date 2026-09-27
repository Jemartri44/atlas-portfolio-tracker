// The rows of the ledger (docs/design/system.md §7.3): on a phone, under one
// heading per month with the date in each row, and the valuations of a day
// gathered into one row that unfolds (feature 020, M8); from
// 1024px, the dense table. What is genuinely about a movement — which figure
// matters, what a reversed row looks like — lives in `MovementLine`.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { type DataColumn, DataTable, Disclosure } from "../../components/index.js";
import { formatDate, formatMonth } from "../../format/date.js";
import {
  byMonth,
  groupValuations,
  hasState,
  type ListEntry,
  type MovementRow,
  showsStateColumn,
  type ValuationGroup,
} from "../../view-models/index.js";
import { MovementFigure, MovementLine, MovementState } from "./MovementLine.jsx";

const COLUMNS: readonly DataColumn<MovementRow>[] = [
  {
    key: "date",
    header: "Fecha",
    cell: (row) => (
      <>
        {/* In ink, and the whole row its target (feature 020, M13): a column of
            twenty underlined dates was the loudest thing on the screen. */}
        <A href={`/movimientos/${row.id}`} class="row-link">
          {formatDate(row.date)}
        </A>
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
      <Show when={hasState(row)}>
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

/**
 * The valuations of one day, folded into one row that unfolds (feature 020,
 * M8), with the same disclosure as everywhere: its summary is a 44px row.
 */
export const ValuationGroupLine = (props: { group: ValuationGroup }): JSX.Element => (
  <Disclosure
    class="valuation-group"
    label={`${props.group.rows.length} valoraciones · ${formatDate(props.group.date)}`}
  >
    <ul class="rows">
      <For each={props.group.rows}>
        {(row) => (
          <li>
            <MovementLine row={row} />
          </li>
        )}
      </For>
    </ul>
  </Disclosure>
);

/** One entry of a list: a movement, or the valuations of a day gathered. */
export const EntryLine = (props: { entry: ListEntry }): JSX.Element => (
  <Show
    when={props.entry.kind === "valuations" ? (props.entry as ValuationGroup) : undefined}
    fallback={<MovementLine row={(props.entry as { row: MovementRow }).row} />}
  >
    {(group) => <ValuationGroupLine group={group()} />}
  </Show>
);

/** `2028-12` → `diciembre de 2028`. */
const monthHeading = (month: string): string =>
  `${formatMonth(`${month}-01`)} de ${month.slice(0, 4)}`;

export const MovementList = (props: { rows: readonly MovementRow[] }): JSX.Element => (
  <>
    <div class="days only-narrow">
      <For each={byMonth(groupValuations(props.rows))}>
        {(month) => (
          <section class="day" aria-label={monthHeading(month.month)}>
            <h2 class="day-title">{monthHeading(month.month)}</h2>
            <ul class="rows">
              <For each={month.entries}>
                {(entry) => (
                  <li>
                    <EntryLine entry={entry} />
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
      columns={
        showsStateColumn(props.rows) ? COLUMNS : COLUMNS.filter((column) => column.key !== "status")
      }
      rows={props.rows}
      tableOnly
      rowClass={(row) => (row.status === "reversed" ? "is-reversed" : undefined)}
    />
  </>
);
