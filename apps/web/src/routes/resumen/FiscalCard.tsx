// The way into the fiscal screen from the summary (P1 of the prompt).
//
// There is **no sixth destination** in the navigation: the screen is opened a
// handful of times a year and a sixth tab would cost every other day. So it is
// reached from here — and from Ajustes — and this card moves: in the income
// tax season, or when there is something of the 720 or the 721 to do, it goes
// **to the top** of the summary; the rest of the year it sits at the end,
// quiet. Which of the two is a fiscal decision and comes from the domain
// (`fiscalAttention`).
//
// The tax engine is **not** on the boot path: the card paints a skeleton and
// loads `fiscal-status.js` after the first paint. Until it arrives the card is
// already there, in its quiet place, saying what it is for.

import type { LedgerEvent } from "@atlas/domain";
import { A } from "@solidjs/router";
import { createResource, For, type JSX, Show } from "solid-js";
import { Icon, Section, Skeleton } from "../../components/index.js";
import type { FiscalStatus } from "./fiscal-status.js";

export default function FiscalCard(props: {
  events: readonly LedgerEvent[];
  date: string;
}): JSX.Element {
  const [status] = createResource(
    () => ({ events: props.events, date: props.date }),
    async (input): Promise<FiscalStatus> => {
      const module = await import("./fiscal-status.js");
      return module.fiscalStatus(input.events, input.date);
    },
  );
  const klass = (): string =>
    `span-4 ${status()?.prominent === true ? "is-first" : "is-last"}`.trimEnd();

  return (
    <Section
      title="Declaración"
      class={klass()}
      aside={
        <Show when={status()?.season === true}>
          <span class="scope">Campaña de la Renta</span>
        </Show>
      }
    >
      <Show when={status()} fallback={<Skeleton lines={2} />}>
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
                      : `Los ejercicios ${current().unfiled.join(", ")} tienen cifras y no constan como declarados.`}
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
  );
}
