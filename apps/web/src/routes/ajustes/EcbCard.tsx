// «Tipos del BCE» in Ajustes (feature 012, block 3): which history the web is
// using — the one the console downloaded into the linked folder, one
// imported by hand, or one downloaded from the cloud —, until when it
// publishes, and the ways to get one. The web never downloads from a third
// party: on the desktop the console does (`atlas fx update`); on the phone it
// is imported, or **downloaded from our own cloud** with the session of this
// browser (feature 016, E3, block 2) — only when the card opens or the user
// asks, never at start nor on a timer. Everything of the ECB is loaded here,
// lazily.

import { createResource, createSignal, type JSX, Show } from "solid-js";
import { ConfirmDialog, Icon, Notice, Section } from "../../components/index.js";
import { downloadCloudHistory } from "../../ecb/cloud.js";
import { formatDate, formatInstantDate } from "../../format/date.js";
import { toAppError } from "../../ledger/errors.js";
import { linkFolder } from "../../ledger/folder.js";
import { canLinkFolder } from "../../ledger/source.js";
// Statically, as the card of the session does: the section of Ajustes is
// lazy already, and a dynamic import would split it for nothing.
import { readSession } from "../../sync/session.js";
import { cloudSaid } from "./ecb-cloud-said.js";

const ecb = () => import("../../ecb/history.js");

type Fetch = typeof fetch;

const PROBLEMS = {
  permission:
    "Hay una carpeta enlazada, pero el navegador ha perdido el permiso para leerla. Vuelve a enlazarla.",
  damaged:
    "El histórico de la carpeta no es el archivo que registra su manifiesto: alguien lo ha cambiado. No se usa; descárgalo otra vez con la consola.",
  unreadable:
    "El histórico de la carpeta no se puede leer. No se usa; descárgalo otra vez con la consola.",
  storage:
    "Este navegador no permite guardar datos del sitio: no puede guardar un histórico importado.",
  config:
    "La configuración local de la carpeta no se entiende: corrígela en la carpeta o bórrala para volver a los valores por defecto.",
} as const;

export const EcbCard = (props: { readonly request?: Fetch } = {}): JSX.Element => {
  const request: Fetch = (input, init) => (props.request ?? fetch)(input, init);
  const [web, { refetch }] = createResource(async () => (await ecb()).loadWebHistory());
  const [busy, setBusy] = createSignal(false);
  const [signedIn, setSignedIn] = createSignal(false);
  const [forgetting, setForgetting] = createSignal(false);
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

  /** Downloads the history of the cloud; `asked`: the user pressed the button. */
  const onCloud = (asked: boolean): Promise<void> =>
    guarded(async () => {
      const shown = cloudSaid(await downloadCloudHistory(request), asked);
      if (shown !== undefined && shown.tone !== "info") {
        setSaid(shown);
        return undefined;
      }
      return shown?.text;
    });

  // Opening the card is asking (015, §7 P12): with a session, the history of
  // the cloud comes down. Never at start and never on a timer (mutant 25). A
  // resource, as the card of the session reads its state: no start-up hook
  // outside the few files ADR-0017 allows.
  createResource(async () => {
    const state = await readSession(request);
    if (state.kind === "signed_in") {
      setSignedIn(true);
      await onCloud(false);
    }
    return state.kind;
  });

  /** Erases the copy of this browser, after asking (review of PR #108, N4). */
  const onForget = (): Promise<void> => {
    setForgetting(false);
    return guarded(async () => {
      await (await ecb()).forgetWebCopy();
      return "Copia borrada: este navegador ya no tiene histórico del BCE. La próxima descarga de la nube lo baja entero.";
    });
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
                  : loaded().origin === "cloud"
                    ? "Bajado de tu nube"
                    : "Importado a mano en este navegador"}
                ,{" "}
                {loaded().source === "zip"
                  ? "del ZIP oficial del BCE"
                  : "de la API de datos del BCE"}
                ; publica hasta el {formatDate(loaded().latest as string)}
                {loaded().when === undefined
                  ? "."
                  : `, ${loaded().origin === "imported" ? "importado" : "descargado"} el ${formatInstantDate(loaded().when as string)}.`}
              </p>
            </Show>
            <Show when={loaded().problem}>
              {(problem) => (
                <p class="card-note">
                  {PROBLEMS[problem()]}
                  <Show when={loaded().configField}>
                    {(field) => <> No se entiende «{field()}».</>}
                  </Show>
                </p>
              )}
            </Show>
          </>
        )}
      </Show>
      <Show when={said()}>
        {(message) => <Notice severity={message().tone}>{message().text}</Notice>}
      </Show>
      <div class="button-row">
        <Show when={signedIn()}>
          <button
            type="button"
            class="secondary"
            disabled={busy()}
            onClick={() => void onCloud(true)}
          >
            <Icon name="import" class="icon-sm" />
            Bajar de la nube
          </button>
        </Show>
        <Show when={web()?.origin === "imported" || web()?.origin === "cloud"}>
          <button
            type="button"
            class="secondary danger"
            disabled={busy()}
            onClick={() => setForgetting(true)}
          >
            Borrar la copia del BCE de este navegador
          </button>
        </Show>
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
        <code>atlas fx update</code>; en el móvil, con la sesión iniciada, se baja de tu nube al
        abrir esta tarjeta, o importa el <code>eurofxref-hist.zip</code> de la web del BCE.
      </p>
      <ConfirmDialog
        open={forgetting()}
        title="¿Borrar la copia del BCE de este navegador?"
        confirm="Borrar la copia"
        destructive
        onClose={() => setForgetting(false)}
        onConfirm={() => void onForget()}
      >
        Solo se borra el histórico que guarda este navegador; el libro no se toca. Con la sesión
        iniciada, se puede volver a bajar de la nube entero, por ejemplo después de que se haya
        restaurado allí una versión buena.
      </ConfirmDialog>
    </Section>
  );
};
