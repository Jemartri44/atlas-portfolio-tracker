// The rows of the ledger, described as columns and painted by `DataTable`:
// cards under 1024px, dense table from there up. The layout used to live here;
// since feature 007 it is shared with Núcleo and Cubo, and what is left is what
// is genuinely about a movement — which figure matters, and what a reversed row
// looks like.

import { A } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { Amount, type DataColumn, DataTable, Tag } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import type { MovementRow } from "../../view-models/index.js";

const StatusBadge = (props: { row: MovementRow }): JSX.Element => (
  <>
    <Show when={props.row.status !== "current"}>
      <Tag tone={props.row.status === "reversed" ? "danger" : "neutral"}>
        {props.row.statusLabel}
      </Tag>
    </Show>
    <Show when={props.row.invalidReason !== undefined}>
      {" "}
      <Tag tone="danger" title={props.row.invalidReason}>
        inválido
      </Tag>
    </Show>
  </>
);

/** The figure of a movement: its amount, or its quantity when it has no amount. */
const Figure = (props: { row: MovementRow }): JSX.Element => (
  <Show
    when={props.row.amount !== undefined}
    fallback={
      <Show when={props.row.quantity !== undefined} fallback={<span class="tiny">—</span>}>
        <Amount quantity={props.row.quantity} />
      </Show>
    }
  >
    <Amount value={props.row.amount} />
  </Show>
);

const COLUMNS: readonly DataColumn<MovementRow>[] = [
  {
    key: "date",
    header: "Fecha",
    card: "meta",
    cell: (row) => (
      <>
        <A href={`/movimientos/${row.id}`}>{formatDate(row.date)}</A>
        <Show when={row.administrative}>
          <span class="tiny" title="Fecha de registro: este tipo no tiene fecha de negocio">
            {" "}
            (registro)
          </span>
        </Show>
      </>
    ),
    // On the card the whole row is already the link, and a link inside a link
    // is not markup, it is a tap that does the wrong thing.
    cardCell: (row) => <span class="tiny">{formatDate(row.date)}</span>,
  },
  { key: "type", header: "Tipo", card: "title", cell: (row) => row.typeLabel },
  {
    key: "subject",
    header: "Cuenta y activo",
    card: "sub",
    cell: (row) => row.subtitle,
    hint: (row) => row.subtitle,
  },
  {
    key: "status",
    header: "Estado",
    card: "meta",
    cell: (row) => (
      <Show when={row.status !== "current"} fallback={<span class="tiny">vigente</span>}>
        <StatusBadge row={row} />
      </Show>
    ),
    cardCell: (row) => <StatusBadge row={row} />,
  },
  {
    key: "figure",
    header: "Importe o cantidad",
    numeric: true,
    card: "figure",
    cell: (row) => <Figure row={row} />,
  },
];

export const MovementList = (props: { rows: readonly MovementRow[] }): JSX.Element => (
  <DataTable
    label="Movimientos"
    columns={COLUMNS}
    rows={props.rows}
    href={(row) => `/movimientos/${row.id}`}
    rowClass={(row) => (row.status === "reversed" ? "is-reversed" : undefined)}
  />
);
