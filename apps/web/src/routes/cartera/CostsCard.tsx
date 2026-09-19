// "¿Qué me cuesta esto?" — commissions per asset, the weighted TER and the
// estimated yearly cost.
//
// The **standalone charges** (custody, administration, connectivity) go in a
// column of their own (docs/design/system.md §7.5): they are not part of the
// acquisition cost nor of the transmission value (art. 35 LIRPF,
// `docs/business-rules.md` §5.2), and they are shown apart, said to be apart,
// and never added to the commissions of a trade.
//
// Only the **core's** charges are here. The bucket's are on `/cubo`, with the
// bucket's own total: this screen once showed both books' rows under a line
// that read "Total del núcleo" and summed only one of them.

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
  TotalLine,
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
  { key: "class", header: "Tipo de activo", cell: (row) => row.assetClass },
  {
    key: "fees",
    header: "Comisiones pagadas",
    numeric: true,
    card: "sub",
    cell: (row) => <Amount value={row.fees} />,
    cardCell: (row) => (
      <span>
        TER <Figure value={row.ter} unit="percent" /> · comisiones <Amount value={row.fees} />
      </span>
    ),
  },
  {
    key: "pct",
    header: "% invertido",
    numeric: true,
    cell: (row) => <Figure value={row.feesPct} unit="percent" decimals="auto" />,
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
    card: "figure",
    cell: (row) => <Amount value={row.annualCost} missingReason="sin precio" />,
  },
];

export const CostsCard = (props: { view: CostsView }): JSX.Element => (
  <Section title="Costes" class="span-12" aside={<span>coste anual estimado</span>}>
    <div class="costs">
      <div class="costs-main">
        <Show
          when={props.view.core.rows.length > 0}
          fallback={<p class="meta">Todavía no hay costes registrados.</p>}
        >
          <DataTable
            label="Costes de la cartera principal"
            columns={CORE_COLUMNS}
            rows={props.view.core.rows}
          />
          <TotalLine
            label={
              <>
                Comisiones de operaciones de la cartera
                <Show when={props.view.core.partial}>
                  {" "}
                  <Tag icon="half">parcial</Tag>
                </Show>
              </>
            }
          >
            <Amount value={props.view.core.fees} />
            <span class="meta">
              TER medio <Figure value={props.view.core.weightedTer} unit="percent" />
            </span>
          </TotalLine>
          <Show when={props.view.core.partial}>
            <p class="card-note">
              El agregado solo cubre la parte de la cartera con precio: faltan valoraciones.
            </p>
          </Show>
        </Show>
      </div>

      <div class="costs-side">
        <StandaloneFees
          view={props.view.standalone.core}
          totalLabel="Total de comisiones sueltas"
        />
        <Show when={props.view.standalone.core.rows.length === 0}>
          <h3 class="block-title">Comisiones sueltas</h3>
          <p class="meta">Ninguna registrada en la cartera principal.</p>
        </Show>
        {/*
          Where the rest went. The figure is not repeated here — it belongs to
          the other book — but its absence would otherwise look like a loss.
        */}
        <Show when={props.view.standalone.bucket.rows.length > 0}>
          <p class="card-note">
            El cubo paga las suyas aparte: están en <A href="/cubo">Cubo</A>, con su propio total.
          </p>
        </Show>
      </div>
    </div>
  </Section>
);
