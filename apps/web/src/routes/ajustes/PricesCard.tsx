// «Precios automáticos» in Ajustes: the daily closes the web uses are read from our own cloud with
// the session and held in memory (`GET /api/reference/prices`); the card says how many assets have
// one and what is wrong when something is. Nothing is imported by hand or kept on the device.

import { createResource, type JSX, Show } from "solid-js";
import { FoldSection } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { countOf } from "../../format/number.js";
import { store } from "../../ledger/state.js";

const prices = () => import("../../prices/quotes.js");

const PROBLEMS = {
  unavailable:
    "La nube no ha respondido: no se han podido leer los precios automáticos. Recarga la página para intentarlo otra vez.",
} as const;

export const PricesCard = (): JSX.Element => {
  // Keyed on the ledger: Ajustes can be painted before the ledger is open, and reading the prices
  // of an empty catalogue said «sin precios» of a device that had them.
  const [quotes] = createResource(
    () => ({ snapshot: store.snapshot() }),
    async ({ snapshot }) =>
      (await prices()).loadWebQuotes([...(snapshot?.state.assets.keys() ?? [])]),
  );

  const latest = (): string | undefined => {
    let last: string | undefined;
    for (const closes of quotes()?.closes.values() ?? []) {
      const date = closes.at(-1)?.date;
      if (date !== undefined && (last === undefined || date > last)) {
        last = date;
      }
    }
    return last;
  };

  /** The line of the folded card: what is wrong, or how many assets and until when. */
  const folded = (): string => {
    const loaded = quotes();
    if (loaded === undefined) {
      return "Leyendo…";
    }
    if (loaded.problem !== undefined) {
      return "No se han podido leer";
    }
    const said =
      loaded.closes.size === 0
        ? "Sin precios automáticos"
        : `${countOf(loaded.closes.size, "activo", "activos")}${
            latest() === undefined ? "" : `, hasta el ${formatDate(latest() as string)}`
          }`;
    return loaded.symbolsNotice === undefined ? said : `${said} · 1 aviso`;
  };

  return (
    <FoldSection title="Precios automáticos" summary={folded()}>
      <Show when={quotes()} fallback={<p class="meta">Leyendo…</p>}>
        {(loaded) => (
          <>
            <Show
              when={loaded().closes.size > 0}
              fallback={
                <p>
                  <strong>Sin precios automáticos.</strong> Los valores salen de las valoraciones
                  que registras a mano.
                </p>
              }
            >
              <p>
                Leídos de tu nube:{" "}
                {loaded().closes.size === 1 ? "un activo" : `${loaded().closes.size} activos`}, con
                cierres hasta el {formatDate(latest() as string)}.
              </p>
            </Show>
            <Show when={loaded().problem}>
              {(problem) => <p class="card-note">{PROBLEMS[problem()]}</p>}
            </Show>
            <Show when={loaded().symbolsNotice}>{(said) => <p class="card-note">{said()}</p>}</Show>
          </>
        )}
      </Show>
      <p class="card-note">
        La tarea diaria de la nube descarga los precios de los activos del libro y la web los lee
        con tu sesión, sin guardarlos en este dispositivo. Un activo dado de alta hace poco no tiene
        precio automático hasta la siguiente descarga.
      </p>
    </FoldSection>
  );
};
