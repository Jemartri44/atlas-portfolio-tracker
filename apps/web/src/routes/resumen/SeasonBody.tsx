// What the card of the summary says in the income tax season once the tax
// engine has answered: what is pending, the short calendar
// and the note of the invalid movements. Lazy, apart from the card, so the boot
// keeps only the shell that holds its place (see `FiscalCard.tsx`).

import type { CivilDate } from "@atlas/domain";
import { For, type JSX, Show } from "solid-js";
import type { NameIndex } from "../../format/names.js";
import { GRID, mediaQuery } from "../../shell/media.js";
import CalendarShort from "../fiscal/CalendarStrip.jsx";
import { yearsList } from "./FiscalCard.jsx";
import type { FiscalStatus } from "./fiscal-status.js";

export default function SeasonBody(props: {
  status: FiscalStatus;
  today: CivilDate;
  names: NameIndex;
}): JSX.Element {
  const current = (): FiscalStatus => props.status;
  const wide = mediaQuery(GRID);
  const unfiled = (): string => {
    const years = current().unfiled;
    return !wide()
      ? `${yearsList(years)} sin declarar`
      : years.length === 1
        ? `El ejercicio ${years[0]} tiene cifras y no consta como declarado.`
        : `Los ejercicios ${yearsList(years)} tienen cifras y no constan como declarados.`;
  };
  return (
    <>
      <CalendarShort calendar={current().calendar} today={props.today} names={props.names} />
      <Show
        when={current().lines.length > 0 || current().unfiled.length > 0}
        fallback={
          <Show when={wide()}>
            <p class="card-note">
              La base del ahorro del ejercicio, las casillas del Modelo 100 y si te toca el Modelo
              720.
            </p>
          </Show>
        }
      >
        <ul class="fiscal-todo">
          <For each={wide() ? current().lines : current().brief}>{(line) => <li>{line}</li>}</For>
          <Show when={current().unfiled.length > 0}>
            <li>{unfiled()}</li>
          </Show>
        </ul>
      </Show>
      <Show when={current().invalid > 0}>
        <p class="card-note">
          Con movimientos inválidos no se calcula nada fiscal: repáralos primero.
        </p>
      </Show>
    </>
  );
}
