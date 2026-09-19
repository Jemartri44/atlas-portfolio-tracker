// "¿Qué me cuesta esto?" — commissions per asset, the weighted TER and the
// estimated yearly cost.
//
// The third block is new in feature 007 and is the point of Q9: the **standalone
// charges** (custody, administration, connectivity) are not part of the
// acquisition cost nor of the transmission value (art. 35 LIRPF,
// `docs/business-rules.md` §5.2), and until now they appeared in no screen of
// either interface. Shown apart, said to be apart, and never added to the
// commissions of a trade.
//
// Only the **core's** charges are here. The bucket's are on `/cubo`, with the
// bucket's own total: this screen showed both books' rows under a line that
// read "Total del núcleo" and summed only one of them.

import { A } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import {
  Amount,
  type DataColumn,
  DataTable,
  Figure,
  Section,
  StandaloneFees,
  Tag,
} from "../../components/index.js";
import type { CoreCostRowView, CostsView } from "../../view-models/core/index.js";

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
    cell: (row) => <Amount value={row.fees} />,
  },
  {
    key: "pct",
    header: "% invertido",
    numeric: true,
    card: "sub",
    cell: (row) => <Figure value={row.feesPct} unit="percent" decimals="auto" />,
    cardCell: (row) => (
      <span>
        <Figure value={row.feesPct} unit="percent" decimals="auto" /> de lo invertido · TER{" "}
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
    cell: (row) => <Amount value={row.annualCost} missingReason="sin precio" />,
  },
];

export const CostsCard = (props: { view: CostsView }): JSX.Element => (
  <Section title="Costes">
    <Show
      when={props.view.core.rows.length > 0}
      fallback={
        // Only when there is nothing at all: a ledger with a custody charge and
        // no purchase yet does have costs registered.
        <Show when={props.view.standalone.core.rows.length === 0}>
          <p class="subtle flush">Todavía no hay costes registrados.</p>
        </Show>
      }
    >
      <DataTable label="Costes del núcleo" columns={CORE_COLUMNS} rows={props.view.core.rows} />
      <div class="spread total-line">
        <span class="subject">
          Comisiones de operaciones del núcleo
          <Show when={props.view.core.partial}>
            {" "}
            <Tag tone="caution">parcial</Tag>
          </Show>
        </span>
        <span class="hstack">
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

    <StandaloneFees
      view={props.view.standalone.core}
      totalLabel="Total de comisiones sueltas del núcleo"
    />
    {/*
      Where the rest went. The figure is not repeated here — it belongs to the
      other book — but its absence would otherwise look like a loss.
    */}
    <Show when={props.view.standalone.bucket.rows.length > 0}>
      <p class="note flush">
        El cubo paga las suyas aparte: están en <A href="/cubo">Cubo</A>, con su propio total.
      </p>
    </Show>
  </Section>
);
