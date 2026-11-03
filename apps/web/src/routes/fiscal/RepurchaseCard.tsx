// "Ventana de recompra abierta": the assets whose loss a purchase would still defer,
// beside the calendar, because it is a date to keep in mind and not a figure of
// the return. With nothing at stake the card is not shown: an empty list says
// nothing the calendar does not. It informs and never forbids: buying is the
// user's call, and a repurchase defers the loss, it does not lose it.

import { type JSX, Show } from "solid-js";
import { Amount, type DataColumn, DataTable, Section } from "../../components/index.js";
import type { RepurchaseRow, RepurchaseView } from "../../view-models/fiscal/sale.js";

const COLUMNS: DataColumn<RepurchaseRow>[] = [
  {
    key: "name",
    header: "Activo",
    card: "title",
    cell: (row) => row.name,
    hint: (row) => row.name,
  },
  { key: "until", header: "Abierta hasta el", card: "sub", cell: (row) => row.until },
  { key: "sales", header: "Ventas", card: "meta", cell: (row) => row.sales ?? "" },
  {
    key: "stake",
    header: "Pérdida en juego",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.at_stake_eur} />,
  },
];

export const RepurchaseCard = (props: { view: RepurchaseView }): JSX.Element => (
  <Show when={props.view.rows.length > 0}>
    <Section
      title="Ventana de recompra abierta"
      class="span-12"
      label="Ventana de recompra abierta"
    >
      <p class="card-note">
        Vendiste con pérdida y su ventana de recompra sigue abierta. Si compras el mismo activo, en
        cualquier cuenta,{props.view.transferInCounts ? " o lo recibes por traspaso," : ""} hasta
        esa fecha (incluida), la pérdida en juego se aplaza (no se pierde) hasta que vendas lo
        recomprado.
      </p>
      <DataTable
        label="Activos con la ventana de recompra abierta"
        size="sm"
        rows={props.view.rows}
        columns={COLUMNS}
      />
    </Section>
  </Show>
);
