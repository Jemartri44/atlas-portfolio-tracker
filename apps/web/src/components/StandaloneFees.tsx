// The standalone charges of one book: custody, administration, connectivity.
//
// They are **not** part of the acquisition cost nor of the transmission value
// (art. 35 LIRPF, `docs/business-rules.md` §5.2), so they never join the
// commissions of a trade in any total. They are here because they are money
// leaving the account all the same.
//
// One component, used by both screens, because each book shows **its own**
// charges and its own total: the portfolio's on Cartera, the bucket's on Cubo
// (constitution III).

import { type JSX, Show } from "solid-js";
import type { StandaloneGroupView, StandaloneRowView } from "../view-models/core/index.js";
import { Amount } from "./Amount.jsx";
import { type DataColumn, DataTable } from "./DataTable.jsx";
import { TotalLine } from "./StatLine.jsx";

const COLUMNS: readonly DataColumn<StandaloneRowView>[] = [
  { key: "name", header: "Cuenta", card: "title", cell: (row) => row.name },
  {
    key: "fees",
    header: "Comisiones",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.fees} />,
  },
];

export interface StandaloneFeesProps {
  view: StandaloneGroupView;
  /** How the total names its book: "Total de la cartera", "Total del cubo". */
  totalLabel: string;
}

export const StandaloneFees = (props: StandaloneFeesProps): JSX.Element => (
  <Show when={props.view.rows.length > 0}>
    <h3 class="block-title">Comisiones sueltas</h3>
    <DataTable label="Comisiones sueltas" columns={COLUMNS} rows={props.view.rows} size="sm" />
    <TotalLine label={props.totalLabel}>
      <Amount value={props.view.total} />
    </TotalLine>
    <p class="card-note">
      Custodia, administración, conectividad: van aparte y no forman parte del coste de adquisición
      ni del valor de transmisión.
    </p>
  </Show>
);
