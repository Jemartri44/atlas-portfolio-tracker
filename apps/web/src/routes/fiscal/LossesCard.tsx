// Pending losses and what expires: by year of origin and kind of income, with
// the last year each one can still be offset in.
//
// What expires **in the year being looked at** is a warning and not a row in a
// table: four years pass quietly, and the year they run out is the one chance
// to use them (criterion #10).

import { For, type JSX, Show } from "solid-js";
import type { DataColumn } from "../../components/index.js";
import { Amount, DataTable, EmptyState, Notice, Section } from "../../components/index.js";
import type { AnchorView, ExpiryWarning, PendingView } from "../../view-models/fiscal/index.js";

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
  expiring: readonly ExpiryWarning[];
  anchors: readonly AnchorView[];
}): JSX.Element => (
  <Section title="Pérdidas pendientes de compensar" class="span-6">
    {/*
      **What the engine substitutes, the engine says** (ADR-0024). When a
      return is on record the chain replaces the pending losses it computed
      with the ones that return declared, so the figure below is not the one
      the application calculated — and until feature 011 the screen said so
      nowhere at all. It goes here, next to the figure it affects, and not in
      a note at the end. With privacy on the **fact** is still visible; the
      amounts go through `Amount` like every other amount.
    */}
    <For each={props.anchors}>
      {(anchor) => (
        <Notice severity="info" title={`Anclado en lo que declaraste en ${anchor.year}`}>
          <p>
            <Show
              when={!anchor.before_ledger}
              fallback={
                <>
                  Ese ejercicio es anterior a tus datos, así que lo pendiente viene de lo que
                  declaraste, no de un cálculo.
                </>
              }
            >
              <Show
                when={!anchor.matches}
                fallback={
                  <>
                    Lo que arrastras sale de tu declaración, y{" "}
                    <strong>coincide con lo calculado</strong>.
                  </>
                }
              >
                Lo que arrastras sale de tu declaración y no de lo que calcula la aplicación:
              </Show>
            </Show>
          </p>
          {/*
            By origin, never as a total: the origin is what decides until when
            a balance can be offset, and two substitutions with the same total
            would otherwise read the same.
          */}
          <ul class="anchor-rows">
            <For each={anchor.rows}>
              {(row) => (
                <li>
                  <span>
                    {CATEGORY_TEXTS[row.category]} de {row.origin_year}
                  </span>
                  <span class="anchor-amounts">
                    <Show when={!anchor.before_ledger && !anchor.matches}>
                      calculaba <Amount value={row.computed_eur} coloured />, declaraste{" "}
                    </Show>
                    <Amount value={row.declared_eur} coloured />
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Notice>
      )}
    </For>
    <For each={props.expiring}>
      {(loss) => (
        <Show
          when={loss.when === "last"}
          fallback={
            <Notice severity="info" title="Les queda este ejercicio y el siguiente">
              Las {CATEGORY_TEXTS[loss.category].toLowerCase()} de {loss.origin_year} solo se pueden
              compensar hasta {loss.expires_after}.
            </Notice>
          }
        >
          <Notice severity="caution" title="Este es el último ejercicio para usarlas">
            Las {CATEGORY_TEXTS[loss.category].toLowerCase()} de {loss.origin_year} caducan al
            cerrar {loss.expires_after}: lo que no compenses antes del 31 de diciembre se pierde.
          </Notice>
        </Show>
      )}
    </For>
    {/*
      The empty state is about the **card**, not about one of its two tables:
      saying "no arrastras pérdidas" above a balance of 5.000,00 € that has
      just expired is the card contradicting itself, which is what it did the
      day the year of the expiry started being painted at all.
    */}
    <Show when={props.pending.length > 0}>
      <DataTable label="Pérdidas pendientes" size="sm" rows={props.pending} columns={COLUMNS} />
    </Show>
    <Show when={props.pending.length === 0 && props.expired.length === 0}>
      <EmptyState
        what="No arrastras pérdidas"
        why="Cuando un ejercicio cierre con pérdidas sin compensar, aparecerán aquí con el año en que caducan."
        glyph="check"
      />
    </Show>
    <Show when={props.expired.length > 0}>
      {/*
        In the past tense only when it **is** the past. While the year is
        still running the same balance is still usable, and a table headed
        "caducadas" under a notice saying "you have until 31 December" is the
        card contradicting itself again, in the other direction.
      */}
      <p class="card-note">
        <Show
          when={props.expiring.some((loss) => loss.when === "last")}
          fallback={<>Caducadas al cerrar {props.year}, sin llegar a compensarse:</>}
        >
          Lo que no compenses antes de que acabe {props.year} se pierde:
        </Show>
      </p>
      <DataTable label="Pérdidas caducadas" size="sm" rows={props.expired} columns={COLUMNS} />
    </Show>
  </Section>
);
