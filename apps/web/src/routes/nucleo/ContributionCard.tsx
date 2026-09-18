// "¿Dónde va el dinero este mes?" — the split of the monthly contribution.
//
// Two things the card says every time, and they are not decoration:
//   - the bucket share is a **budget**, separated first and never allocated
//     among the target weights (constitution III);
//   - this is a **proposal**. The orders are placed by hand on the platform and
//     recorded afterwards; the application has never sent an order and never
//     will.

import { A } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import {
  Amount,
  Badge,
  type DataColumn,
  DataTable,
  ErrorView,
  Figure,
  Section,
} from "../../components/index.js";
import type { AppError } from "../../ledger/state.js";
import type { ContributionRowView, ContributionView } from "../../view-models/core/index.js";

const COLUMNS: readonly DataColumn<ContributionRowView>[] = [
  {
    key: "name",
    header: "Activo",
    card: "title",
    cell: (row) => row.name,
    hint: (row) => row.name,
  },
  {
    key: "value",
    header: "Valor hoy",
    numeric: true,
    cell: (row) => <Amount value={row.value} currency={false} />,
  },
  {
    key: "gap",
    header: "Déficit",
    numeric: true,
    card: "sub",
    cell: (row) => <Amount value={row.gap} currency={false} />,
    cardCell: (row) => (
      <span>
        déficit <Amount value={row.gap} currency={false} /> · objetivo{" "}
        <Figure value={row.targetPct} unit="percent" />
      </span>
    ),
  },
  {
    key: "allocation",
    header: "Aportar",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.allocation} />,
  },
  {
    key: "after",
    header: "Peso tras",
    numeric: true,
    cell: (row) => <Figure value={row.weightAfterPct} unit="percent" />,
  },
];

export const ContributionCard = (props: {
  view: ContributionView | undefined;
  error: AppError | undefined;
}): JSX.Element => (
  <Section title="Aportación del mes">
    <Show
      when={props.view}
      fallback={
        <Show when={props.error} fallback={<p class="subtle flush">Sin datos.</p>}>
          {(error) => (
            <ErrorView error={error()} title="La aportación no se puede repartir todavía">
              <A href="/registrar/valuation" role="button" class="secondary">
                Registrar una valoración
              </A>
            </ErrorView>
          )}
        </Show>
      }
    >
      {(view) => (
        <>
          <div class="contribution-head">
            <div class="spread">
              <span class="subject">Aportación</span>
              <span class="row">
                <Amount value={view().amount} />
                <Show when={view().fromSettings}>
                  <Badge title="Configurada en Ajustes">de la configuración</Badge>
                </Show>
              </span>
            </div>
            <div class="spread">
              <span class="subject">
                Presupuesto del cubo <Badge>presupuesto, no asignación</Badge>
              </span>
              <Amount value={view().bucketBudget} />
            </div>
            <div class="spread">
              <span class="subject">A repartir en el núcleo</span>
              <Amount value={view().coreAmount} />
            </div>
          </div>

          <DataTable label="Reparto de la aportación" columns={COLUMNS} rows={view().rows} />

          <div class="spread total-line">
            <span class="subject">Total repartido</span>
            <Amount value={view().coreAmount} />
          </div>

          <Show when={view().surplusDistributed}>
            <p class="note">
              La aportación cubre el déficit de todos los activos: el sobrante se reparte por pesos
              objetivo.
            </p>
          </Show>

          <p class="note">
            <strong>Es una propuesta.</strong> Nada se ha registrado: da las órdenes a mano en la
            plataforma y regístralas después desde <A href="/registrar">Registrar</A>. El cubo se
            lleva su presupuesto aparte y la aplicación nunca elige qué comprar en él.
          </p>
        </>
      )}
    </Show>
  </Section>
);
