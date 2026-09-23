// Pending losses and what expires: by year of origin and kind of income, with
// the last year each one can still be offset in.
//
// What expires **in the year being looked at** is a warning and not a row in a
// table: four years pass quietly, and the year they run out is the one chance
// to use them (criterion #10).

import { For, type JSX, Show } from "solid-js";
import type { DataColumn } from "../../components/index.js";
import { Amount, DataTable, EmptyState, Notice, Section } from "../../components/index.js";
import type { PendingView } from "../../view-models/fiscal/index.js";

const CATEGORY_TEXTS: Record<PendingView["category"], string> = {
  capital_gain: "Pérdidas patrimoniales",
  movable_capital: "Rendimientos negativos",
};

const COLUMNS: DataColumn<PendingView>[] = [
  {
    key: "origin",
    header: "De",
    card: "title",
    cell: (row) => `${CATEGORY_TEXTS[row.category]} de ${row.origin_year}`,
  },
  {
    key: "expires",
    header: "Último ejercicio para usarlas",
    card: "sub",
    cell: (row) => `Se pueden compensar hasta ${row.expires_after}`,
  },
  {
    key: "amount",
    header: "Pendiente",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.amount_eur} coloured />,
  },
];

export const LossesCard = (props: {
  year: number;
  pending: readonly PendingView[];
  expired: readonly PendingView[];
}): JSX.Element => (
  <Section title="Pérdidas pendientes de compensar" class="span-6">
    <For each={props.pending.filter((loss) => loss.expiring)}>
      {(loss) => (
        <Notice severity="caution" title="Este es el último año para usarlas">
          Las {CATEGORY_TEXTS[loss.category].toLowerCase()} de {loss.origin_year} caducan al cerrar{" "}
          {loss.expires_after}: lo que no se compense en este ejercicio se pierde.
        </Notice>
      )}
    </For>
    <Show
      when={props.pending.length > 0}
      fallback={
        <EmptyState
          what="No arrastras pérdidas"
          why="Cuando un ejercicio cierre con pérdidas sin compensar, aparecerán aquí con el año en que caducan."
          glyph="check"
        />
      }
    >
      <DataTable label="Pérdidas pendientes" size="sm" rows={props.pending} columns={COLUMNS} />
    </Show>
    <Show when={props.expired.length > 0}>
      <p class="card-note">Caducadas al cerrar {props.year}, sin llegar a compensarse:</p>
      <DataTable label="Pérdidas caducadas" size="sm" rows={props.expired} columns={COLUMNS} />
    </Show>
  </Section>
);
