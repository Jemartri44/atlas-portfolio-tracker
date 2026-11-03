// «Tipos del BCE» in Ajustes: the history the web is using — read from our own cloud with the
// session and held in memory, never from a third party and never kept on the device —, until when
// it publishes, and the button to read it again. Everything of the ECB is loaded here, lazily.

import { createResource, type JSX, Show } from "solid-js";
import { Icon, Section } from "../../components/index.js";
import { formatDate, formatInstantDate } from "../../format/date.js";
import { remoteFailure } from "../../format/messages/errors.js";
import { SaidNotice, useCardAction } from "./card-action.jsx";

const ecb = () => import("../../ecb/history.js");

const PROBLEMS = {
  unavailable: (code: string | undefined) =>
    `No se ha podido leer el histórico del BCE de la nube: ${
      (code === undefined ? undefined : remoteFailure(code)) ??
      "la nube no ha respondido como se esperaba."
    } Los tipos se teclean; vuelve a intentarlo con «Volver a leer».`,
  unreadable: () =>
    "El histórico de la nube no es el archivo que registra su manifiesto o no se entiende: no se usa. Los tipos se teclean.",
} as const;

export const EcbCard = (): JSX.Element => {
  const [web, { refetch }] = createResource(async () => (await ecb()).loadWebHistory());
  const { busy, said, run } = useCardAction(() => void refetch());

  /** Reads the history of the cloud again. */
  const onReload = (): Promise<void> =>
    run(async () => {
      const read = await (await ecb()).reloadWebHistory();
      return read.history === undefined
        ? undefined
        : `Histórico leído de la nube: publica hasta el ${formatDate(read.latest as string)}.`;
    });

  return (
    <Section title="Tipos del BCE">
      <Show when={web()} fallback={<p class="meta">Leyendo…</p>}>
        {(loaded) => (
          <>
            <Show
              when={loaded().history !== undefined}
              fallback={
                <p>
                  <strong>Sin histórico del BCE.</strong> Los tipos se teclean, y la verificación no
                  puede contrastarlos con el oficial.
                </p>
              }
            >
              <p>
                Leído de tu nube,{" "}
                {loaded().source === "zip"
                  ? "del ZIP oficial del BCE"
                  : "de la API de datos del BCE"}
                ; publica hasta el {formatDate(loaded().latest as string)}
                {loaded().when === undefined
                  ? "."
                  : `, leído el ${formatInstantDate(loaded().when as string)}.`}
              </p>
            </Show>
            <Show when={loaded().problem}>
              {(problem) => <p class="card-note">{PROBLEMS[problem()](loaded().code)}</p>}
            </Show>
          </>
        )}
      </Show>
      <SaidNotice said={said()} />
      <div class="button-row">
        <button type="button" class="secondary" disabled={busy()} onClick={() => void onReload()}>
          <Icon name="import" class="icon-sm" />
          Volver a leer
        </button>
      </div>
      <p class="card-note">
        El histórico lo descarga la nube del BCE cada día; la web lo lee con tu sesión al abrir esta
        tarjeta o una pantalla que lo necesita, sin guardarlo en este dispositivo.
      </p>
    </Section>
  );
};
