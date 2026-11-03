// "No recomprar hasta": the assets whose loss a purchase would still defer,
// beside the calendar, because it is a date to keep in mind and not a figure of
// the return. With nothing at stake the card is not shown: an empty list says
// nothing the calendar does not.

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
  { key: "until", header: "No comprar hasta el", card: "sub", cell: (row) => row.until },
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
    <Section title="No recomprar hasta" class="span-12" label="No recomprar hasta">
      <p class="card-note">
        Vendiste con pérdida y su ventana de recompra sigue abierta. Si vuelves a comprar el mismo
        activo, en cualquier cuenta,
        {props.view.transferInCounts ? " o lo recibes por traspaso," : ""} hasta esa fecha
        (incluida), la pérdida no cuenta este año: se aplaza hasta que vendas lo recomprado.
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
