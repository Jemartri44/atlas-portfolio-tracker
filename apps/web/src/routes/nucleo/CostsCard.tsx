// "¿Qué me cuesta esto?" — commissions per asset, the weighted TER and the
// estimated yearly cost.
//
// The third block is new in feature 007 and is the point of Q9: the **standalone
// charges** (custody, administration, connectivity) are not part of the
// acquisition cost nor of the transmission value (art. 35 LIRPF,
// `docs/business-rules.md` §5.2), and until now they appeared in no screen of
// either interface. Shown apart, said to be apart, and never added to the
// commissions of a trade.

import { type JSX, Show } from "solid-js";
import {
  Amount,
  Badge,
  type DataColumn,
  DataTable,
  Figure,
  Section,
} from "../../components/index.js";
import type {
  CoreCostRowView,
  CostsView,
  StandaloneRowView,
} from "../../view-models/core/index.js";

const CORE_COLUMNS: readonly DataColumn<CoreCostRowView>[] = [
  {
    key: "name",
    header: "Activo",
    card: "title",
    cell: (row) => row.name,
    hint: (row) => row.name,
  },
  {
    key: "fees",
    header: "Comisiones",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.fees} currency={false} />,
  },
  {
    key: "pct",
    header: "% invertido",
    numeric: true,
    card: "sub",
    cell: (row) => <Figure value={row.feesPct} unit="percent" decimals={4} />,
    cardCell: (row) => (
      <span>
        <Figure value={row.feesPct} unit="percent" decimals={4} /> de lo invertido · TER{" "}
        <Figure value={row.ter} unit="percent" />
      </span>
    ),
  },
  {
    key: "ter",
    header: "TER",
    numeric: true,
    cell: (row) => <Figure value={row.ter} unit="percent" />,
  },
  {
    key: "annual",
    header: "Coste anual",
    numeric: true,
    cell: (row) => <Amount value={row.annualCost} missingReason="sin precio" currency={false} />,
  },
];

const STANDALONE_COLUMNS: readonly DataColumn<StandaloneRowView>[] = [
  { key: "name", header: "Cuenta", card: "title", cell: (row) => row.name },
  { key: "book", header: "Libro", card: "meta", cell: (row) => row.book },
  {
    key: "fees",
    header: "Comisiones",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.fees} />,
  },
];

export const CostsCard = (props: { view: CostsView }): JSX.Element => (
  <Section title="Costes">
    <Show
      when={props.view.core.rows.length > 0}
      fallback={<p class="subtle flush">Todavía no hay costes registrados.</p>}
    >
      <DataTable label="Costes del núcleo" columns={CORE_COLUMNS} rows={props.view.core.rows} />
      <div class="spread total-line">
        <span class="subject">
          Total del núcleo
          <Show when={props.view.core.partial}>
            {" "}
            <Badge tone="warning">parcial</Badge>
          </Show>
        </span>
        <span class="row">
          <Amount value={props.view.core.fees} />
          <span class="tiny">
            TER medio <Figure value={props.view.core.weightedTer} unit="percent" />
          </span>
        </span>
      </div>
      <Show when={props.view.core.partial}>
        <p class="note">
          El agregado solo cubre la parte del núcleo con precio: faltan valoraciones.
        </p>
      </Show>
    </Show>

    <Show when={props.view.standalone.rows.length > 0}>
      <h3 class="block-title">Comisiones sueltas</h3>
      <p class="note flush">
        Custodia, administración, conectividad. <strong>No forman parte</strong> del coste de
        adquisición ni del valor de transmisión, así que no entran en la ganancia patrimonial
        (business-rules.md §5.2). Están aquí porque son dinero que sale igualmente.
      </p>
      <DataTable
        label="Comisiones sueltas"
        columns={STANDALONE_COLUMNS}
        rows={props.view.standalone.rows}
      />
      <div class="spread total-line">
        <span class="subject">Total del núcleo</span>
        <Amount value={props.view.standalone.core} />
      </div>
    </Show>
  </Section>
);
