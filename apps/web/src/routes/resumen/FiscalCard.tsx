// The way into the fiscal screen from the summary (P1 of prompt 010; feature
// 020, E2, M2).
//
// There is **no sixth destination** in the navigation: the screen is opened a
// handful of times a year and a sixth tab would cost every other day. So it is
// reached from here — and from Ajustes — and this card has two shapes, decided
// by the domain (`inRentaSeason`, known on the first paint):
//
// - **in the income tax season**, a card at the top of the summary, with
//   «Campaña de la Renta» beside its title and what is pending;
// - **out of it**, a row folded at the end that says only its neutral state
//   and the years with figures and no return recorded (Q2) — never a notice:
//   what is pending of the 720 and the 721, and the invalid events, go to
//   *Atención*, and a notice is never said twice.
//
// The tax engine is **not** on the boot path: the summary asks it after the
// first paint (`fiscal-status.ts`) and hands its answer down; until it
// arrives the card keeps its place with a skeleton, and the row says its
// neutral state already.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Icon, Section, Skeleton } from "../../components/index.js";
import type { FiscalStatus } from "./fiscal-status.js";

/** «2026, 2027 y 2028», in Spanish. */
const yearsList = (years: readonly number[]): string =>
  years.length <= 1
    ? years.join("")
    : `${years.slice(0, -1).join(", ")} y ${years[years.length - 1]}`;

export default function FiscalCard(props: {
  season: boolean;
  /** The tax side of the summary, once the engine has answered. */
  status: () => FiscalStatus | undefined;
  /** The year whose return comes next (`nextReturnYear` of the domain). */
  year: number;
}): JSX.Element {
  return (
    <Show
      when={props.season}
      fallback={
        <section class="card span-4 summary-fiscal is-row" aria-label="Declaración">
          <A href="/fiscal" class="fiscal-row">
            <Icon name="calendar" class="icon" />
            <span class="fiscal-row-text">
              <strong>Declaración {props.year}</strong> · fuera de campaña
              <Show when={(props.status()?.unfiled.length ?? 0) > 0}>
                {` · sin declarar: ${yearsList(props.status()?.unfiled ?? [])}`}
              </Show>
            </span>
            <span class="fiscal-row-action">
              Ver
              <Icon name="arrow" class="icon-sm" />
            </span>
          </A>
        </section>
      }
    >
      <Section
        title="Declaración"
        class="span-4 summary-fiscal"
        aside={<span class="scope">Campaña de la Renta</span>}
      >
        <Show when={props.status()} fallback={<Skeleton lines={2} />}>
          {(current) => (
            <>
              <Show
                when={current().lines.length > 0 || current().unfiled.length > 0}
                fallback={
                  <p class="card-note">
                    La base del ahorro del ejercicio, las casillas del Modelo 100 y si te toca el
                    Modelo 720.
                  </p>
                }
              >
                <ul class="fiscal-todo">
                  <For each={current().lines}>{(line) => <li>{line}</li>}</For>
                  <Show when={current().unfiled.length > 0}>
                    <li>
                      {current().unfiled.length === 1
                        ? `El ejercicio ${current().unfiled[0]} tiene cifras y no consta como declarado.`
                        : `Los ejercicios ${yearsList(current().unfiled)} tienen cifras y no constan como declarados.`}
                    </li>
                  </Show>
                </ul>
              </Show>
              <Show when={current().invalid > 0}>
                <p class="card-note">
                  Con movimientos inválidos no se calcula nada fiscal: repáralos primero.
                </p>
              </Show>
            </>
          )}
        </Show>
        <A href="/fiscal" class="card-foot">
          <span>Ver la declaración</span>
          <Icon name="chevright" class="icon-sm" />
        </A>
      </Section>
    </Show>
  );
}
