// What the card of the summary says in the income tax season once the tax
// engine has answered (feature 020, E4): what is pending, the short calendar
// and the note of the invalid movements. Lazy, apart from the card, so the boot
// keeps only the shell that holds its place (see `FiscalCard.tsx`).

import type { CivilDate } from "@atlas/domain";
import { For, type JSX, Show } from "solid-js";
import type { NameIndex } from "../../format/names.js";
import CalendarShort from "../fiscal/CalendarStrip.jsx";
import { yearsList } from "./FiscalCard.jsx";
import type { FiscalStatus } from "./fiscal-status.js";

export default function SeasonBody(props: {
  status: FiscalStatus;
  today: CivilDate;
  names: NameIndex;
}): JSX.Element {
  const current = (): FiscalStatus => props.status;
  return (
    <>
      <Show
        when={current().lines.length > 0 || current().unfiled.length > 0}
        fallback={
          <p class="card-note">
            La base del ahorro del ejercicio, las casillas del Modelo 100 y si te toca el Modelo
            720.
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
      <CalendarShort calendar={current().calendar} today={props.today} names={props.names} />
      <Show when={current().invalid > 0}>
        <p class="card-note">
          Con movimientos inválidos no se calcula nada fiscal: repáralos primero.
        </p>
      </Show>
    </>
  );
}
