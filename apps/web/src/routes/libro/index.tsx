// "¿Con qué libro trabajo?" — first run and change of ledger.
//
// The file path goes first where it exists, because it writes the **same**
// `ledger.jsonl` the CLI uses and there is no copy to keep in sync (ADR-0019).
// Where it does not exist — every phone, Firefox, Safari (research.md §4) — the
// browser path is offered with its limitation written down, never dressed up as
// a definitive store.

import { useNavigate } from "@solidjs/router";
import { createSignal, type JSX, Show } from "solid-js";
import { Callout, ErrorView } from "../../components/index.js";
import { openBrowserLedger, openDirectoryLedger, reconnect } from "../../ledger/actions.js";
import { toAppError } from "../../ledger/errors.js";
import { importLedger } from "../../ledger/export.js";
import { canUseDirectory } from "../../ledger/source.js";
import type { AppError } from "../../ledger/state.js";
import { store } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";

export default function LibroRoute(): JSX.Element {
  const navigate = useNavigate();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [imported, setImported] = createSignal<number | undefined>(undefined);

  const phase = () => store.load();
  const isOpen = (): boolean => phase().phase === "ready";
  const failedError = (): AppError | undefined => {
    const current = phase();
    return current.phase === "failed" ? current.error : undefined;
  };

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      if (store.load().phase === "ready") {
        navigate("/", { replace: true });
      }
    } catch (failure) {
      setError(toAppError(failure).message);
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      // `importLedger` validates before opening anything: a file that is not a
      // ledger leaves the state exactly as it was (inventory V6).
      const events = await importLedger(await file.text());
      setImported(events);
      navigate("/", { replace: true });
    } catch (failure) {
      setError(toAppError(failure).message);
    } finally {
      setBusy(false);
      input.value = "";
    }
  };

  return (
    <>
      <PageHeader
        title={isOpen() ? "Cambiar de libro" : "Abrir el libro"}
        lead="La aplicación funciona en el dispositivo: no hay servidor, ni cuenta, ni nada que se suba a ningún sitio."
      />

      <Show when={error() !== undefined}>
        <Callout tone="error" title="No se ha podido abrir">
          {error()}
          <p class="tiny flush">
            No se ha tocado nada: el libro que tuvieras abierto sigue como estaba.
          </p>
        </Callout>
      </Show>

      {/*
        The failure of the boot is painted **here**, where the user always ends
        up, and for as long as it lasts. It used to live only on the screen that
        provoked it, so navigating away lost it and it only came back by
        repeating the action (inventory V6).
      */}
      <Show when={failedError()}>
        {(failure) => (
          <ErrorView error={failure()} title="El libro que había no se ha podido leer" />
        )}
      </Show>

      <Show when={phase().phase === "reconnect"}>
        <Callout
          tone="warning"
          title="Hay que reconectar la carpeta"
          action={
            <button
              type="button"
              disabled={busy()}
              onClick={() => {
                const current = phase();
                if (current.phase === "reconnect") {
                  void run(() => reconnect(current.handle));
                }
              }}
            >
              Reconectar
            </button>
          }
        >
          El navegador recuerda qué carpeta era, pero el permiso caduca al cerrar todas las
          pestañas: hace falta un clic tuyo para devolverlo.
        </Callout>
      </Show>

      <div class="stack">
        <Show when={canUseDirectory()}>
          <article class="card">
            <header>
              <h2>El fichero de mi ordenador</h2>
              <span class="badge is-positive">Recomendado</span>
            </header>
            <p>
              Eliges la carpeta que contiene tu <code>ledger.jsonl</code> y la aplicación escribe en{" "}
              <strong>ese mismo fichero</strong>, el que usa la CLI. Sin copias y sin sincronizar
              nada. El permiso se recuerda; al abrir una sesión nueva basta un clic.
            </p>
            <button type="button" disabled={busy()} onClick={() => void run(openDirectoryLedger)}>
              Elegir la carpeta del libro
            </button>
          </article>
        </Show>

        <article class="card">
          <header>
            <h2>El almacenamiento del navegador</h2>
            <Show when={!canUseDirectory()}>
              <span class="badge">Única vía en este navegador</span>
            </Show>
          </header>
          <p>
            El libro vive dentro del navegador de este dispositivo. Es la única vía en el móvil, en
            Firefox y en Safari, porque no tienen acceso a ficheros del disco.
          </p>
          <p class="subtle">
            <strong>No es un almacén definitivo</strong>: si borras los datos del sitio, el libro se
            va con ellos. Expórtalo con frecuencia; la aplicación te lo recordará.
          </p>
          <div class="row wrap">
            <button type="button" disabled={busy()} onClick={() => void run(openBrowserLedger)}>
              Usar el almacenamiento del navegador
            </button>
            <label class="row flush">
              <span class="subtle">o importar un fichero:</span>
              <input
                type="file"
                accept=".jsonl,.json,application/x-ndjson,text/plain"
                disabled={busy()}
                onChange={(event) => void onImport(event)}
                class="file-input"
              />
            </label>
          </div>
          <Show when={imported() !== undefined}>
            <p class="subtle">Importados {imported()} eventos.</p>
          </Show>
        </article>
      </div>
    </>
  );
}
