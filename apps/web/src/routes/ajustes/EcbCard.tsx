// «Tipos del BCE» in Ajustes (feature 012, block 3): which history the web is
// using — the one the console downloaded into the linked folder, or one
// imported by hand —, until when it publishes, and the two ways to get one.
// The web never downloads it: on the desktop the console does
// (`atlas fx update`), on the phone it is imported, until the cloud exists
// (ADR-0029, point 3). Everything of the ECB is loaded here, lazily.

import { createResource, createSignal, type JSX, Show } from "solid-js";
import { Icon, Notice, Section } from "../../components/index.js";
import { formatDate, formatInstantDate } from "../../format/date.js";
import { toAppError } from "../../ledger/errors.js";
import { linkFolder } from "../../ledger/folder.js";
import { canLinkFolder } from "../../ledger/source.js";

const ecb = () => import("../../ecb/history.js");

const PROBLEMS = {
  permission:
    "Hay una carpeta enlazada, pero el navegador ha perdido el permiso para leerla. Vuelve a enlazarla.",
  damaged:
    "El histórico de la carpeta no es el archivo que registra su manifiesto: alguien lo ha cambiado. No se usa; descárgalo otra vez con la consola.",
  unreadable:
    "El histórico de la carpeta no se puede leer. No se usa; descárgalo otra vez con la consola.",
  storage:
    "Este navegador no permite guardar datos del sitio: no puede guardar un histórico importado.",
} as const;

export const EcbCard = (): JSX.Element => {
  const [web, { refetch }] = createResource(async () => (await ecb()).loadWebHistory());
  const [busy, setBusy] = createSignal(false);
  const [said, setSaid] = createSignal<{ tone: "info" | "danger" | "caution"; text: string }>();

  const guarded = async (action: () => Promise<string | undefined>): Promise<void> => {
    setBusy(true);
    setSaid(undefined);
    try {
      const text = await action();
      if (text !== undefined) {
        setSaid({ tone: "info", text });
      }
    } catch (failure) {
      setSaid({ tone: "danger", text: toAppError(failure).message });
    } finally {
      setBusy(false);
      refetch();
    }
  };

  const onLink = (): Promise<void> =>
    guarded(async () => {
      if (!(await linkFolder())) {
        return undefined;
      }
      const loaded = await (await ecb()).reloadWebHistory();
      return loaded.history === undefined
        ? "Carpeta enlazada, pero no trae histórico del BCE: descárgalo en ella con `atlas fx update`."
        : "Carpeta enlazada: se usa el histórico que descargó la consola.";
    });

  const onImport = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) {
      return;
    }
    await guarded(async () => {
      const outcome = await (await ecb()).importHistoryFile(
        file.name,
        new Uint8Array(await file.arrayBuffer()),
      );
      if (outcome.kind === "rejected") {
        setSaid({
          tone: "caution",
          text: `El archivo cambia ${outcome.total} ${outcome.total === 1 ? "tipo ya publicado" : "tipos ya publicados"} del histórico importado antes: no se ha usado, y sigue el anterior. O el BCE ha corregido un tipo o el archivo está mal.`,
        });
        return undefined;
      }
      return `Histórico importado: publica hasta el ${formatDate(outcome.latest)}.`;
    });
    input.value = "";
  };

  return (
    <Section title="Tipos del BCE">
      <Show when={web()} fallback={<p class="meta">Leyendo…</p>}>
        {(loaded) => (
          <>
            <Show
              when={loaded().history !== undefined}
              fallback={
                <p>
                  <strong>Sin histórico del BCE en este dispositivo.</strong> Los tipos se teclean,
                  y la verificación no puede contrastarlos con el oficial.
                </p>
              }
            >
              <p>
                {loaded().origin === "folder"
                  ? "El que descargó la consola en la carpeta enlazada"
                  : "Importado a mano en este navegador"}
                ,{" "}
                {loaded().source === "zip"
                  ? "del ZIP oficial del BCE"
                  : "de la API de datos del BCE"}
                ; publica hasta el {formatDate(loaded().latest as string)}
                {loaded().when === undefined
                  ? "."
                  : `, ${loaded().origin === "folder" ? "descargado" : "importado"} el ${formatInstantDate(loaded().when as string)}.`}
              </p>
            </Show>
            <Show when={loaded().problem}>
              {(problem) => <p class="card-note">{PROBLEMS[problem()]}</p>}
            </Show>
          </>
        )}
      </Show>
      <Show when={said()}>
        {(message) => <Notice severity={message().tone}>{message().text}</Notice>}
      </Show>
      <div class="button-row">
        <Show when={canLinkFolder()}>
          <button type="button" class="secondary" disabled={busy()} onClick={() => void onLink()}>
            <Icon name="laptop" class="icon-sm" />
            Leer de la carpeta de la consola
          </button>
        </Show>
        <label class="file-button">
          <Icon name="import" class="icon-sm" />
          <span>Importar el histórico</span>
          <input
            type="file"
            class="sr-only"
            accept=".zip,.csv,application/zip,text/csv"
            disabled={busy()}
            onChange={(event) => void onImport(event)}
          />
        </label>
      </div>
      <p class="card-note">
        La web no descarga nada de fuera. En el ordenador lo descarga la consola con{" "}
        <code>atlas fx update</code>; en el móvil, importa el <code>eurofxref-hist.zip</code> de la
        web del BCE.
      </p>
    </Section>
  );
};
