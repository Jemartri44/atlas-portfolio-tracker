// "¿Dónde guardamos tus datos?" — first run and change of file.
//
// The folder goes first where it exists, because it writes the **same**
// `ledger.jsonl` the CLI uses and there is no copy to keep in sync (ADR-0019).
// Where it does not exist — every phone, Firefox, Safari (research.md §4) — the
// browser is the one card, with its limitation written down, never dressed up
// as a definitive store, and the folder is one line under it saying where it
// can be used: half a phone screen for an option a phone cannot take was noise
// (review of 2026-09-19). One primary button per screen: with the folder
// available, the browser's is secondary.
//
// Two option cards, side by side on a wide screen and centred, because this is
// a choice and not a screen of data (docs/design/system.md §7.1). Reconnecting
// is one card. There is no navigation until something is open (D8).

import { useNavigate } from "@solidjs/router";
import { createSignal, type JSX, Show } from "solid-js";
import { ErrorView, Icon, Notice, Tag } from "../../components/index.js";
import { countOf } from "../../format/number.js";
import { openBrowserLedger, openDirectoryLedger, reconnect } from "../../ledger/actions.js";
import { toAppError } from "../../ledger/errors.js";
import { importLedger } from "../../ledger/export.js";
import { canUseDirectory } from "../../ledger/source.js";
import { type AppError, messageWithLine, store } from "../../ledger/state.js";
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
      setError(messageWithLine(toAppError(failure)));
    } finally {
      setBusy(false);
      input.value = "";
    }
  };

  const Folder = (): JSX.Element => (
    <article class="card choice" aria-labelledby="h-folder">
      <span class="choice-glyph" aria-hidden="true">
        <Icon name="laptop" />
      </span>
      <div class="choice-head">
        <h2 id="h-folder">Una carpeta de tu ordenador</h2>
        <Tag tone="done" icon="check">
          Recomendado
        </Tag>
      </div>
      <p>
        Eliges la carpeta que contiene tu <code>ledger.jsonl</code> y Atlas escribe en{" "}
        <strong>ese mismo archivo</strong>, el que usa la CLI. Sin copias y sin sincronizar nada. El
        permiso se recuerda; en una sesión nueva basta un clic.
      </p>
      <div class="choice-actions">
        <button type="button" disabled={busy()} onClick={() => void run(openDirectoryLedger)}>
          {phase().phase === "reconnect" ? "Elegir otra carpeta" : "Elegir la carpeta"}
        </button>
      </div>
    </article>
  );

  /** The folder where this browser cannot open one: said in a line, not offered. */
  const FolderElsewhere = (): JSX.Element => (
    <p class="choice-elsewhere">
      <Icon name="laptop" class="icon-sm" />
      <span>
        En el ordenador, con Chrome o Edge, Atlas puede guardar tus datos en una carpeta tuya, en el
        mismo archivo que usa la CLI.
      </span>
    </p>
  );

  const Browser = (): JSX.Element => (
    <article class="card choice" aria-labelledby="h-browser">
      <span class="choice-glyph" aria-hidden="true">
        <Icon name="browser" />
      </span>
      <h2 id="h-browser">El almacenamiento del navegador</h2>
      <p>
        Tus datos viven dentro del navegador de este dispositivo. Es la vía del móvil, de Firefox y
        de Safari, que no abren archivos del disco.
      </p>
      <p class="card-note">
        <strong>No es un almacén definitivo</strong>: si borras los datos del sitio, se van con
        ellos. Expórtalos con frecuencia; Atlas te lo recordará.
      </p>
      <div class="choice-actions">
        <button
          type="button"
          class={canUseDirectory() ? "secondary" : undefined}
          disabled={busy()}
          onClick={() => void run(openBrowserLedger)}
        >
          Usar el almacenamiento del navegador
        </button>
        <label class="file-button">
          <Icon name="import" class="icon-sm" />
          <span>Importar un archivo</span>
          <input
            type="file"
            class="sr-only"
            accept=".jsonl,.json,application/x-ndjson,text/plain"
            disabled={busy()}
            onChange={(event) => void onImport(event)}
          />
        </label>
      </div>
      <Show when={imported() !== undefined}>
        <p class="card-note">
          {countOf(imported() ?? 0, "movimiento importado", "movimientos importados")}.
        </p>
      </Show>
    </article>
  );

  return (
    <div class="first-run">
      <PageHeader
        title={isOpen() ? "Cambiar de archivo" : "¿Dónde guardamos tus datos?"}
        lead="Atlas funciona en este dispositivo: sin servidor, sin cuenta, sin subir nada a ningún sitio."
      />

      <Show when={error() !== undefined}>
        <Notice severity="danger" title="No se ha podido abrir">
          {error()}
          {/* Said once: a message that already says it does not get it twice. */}
          {/no se ha tocado nada/i.test(error() ?? "")
            ? ""
            : " No se ha tocado nada: lo que tuvieras abierto sigue como estaba."}
        </Notice>
      </Show>

      {/*
        The failure of the boot is painted **here**, where the user always ends
        up, and for as long as it lasts. It used to live only on the screen that
        provoked it, so navigating away lost it and it only came back by
        repeating the action (inventory V6).
      */}
      <Show when={failedError()}>
        {(failure) => <ErrorView error={failure()} title="Tus datos no se han podido leer" />}
      </Show>

      <Show
        when={phase().phase === "reconnect"}
        fallback={
          <Show
            when={canUseDirectory()}
            fallback={
              <div class="choices is-single">
                <Browser />
                <FolderElsewhere />
              </div>
            }
          >
            <div class="choices">
              <Folder />
              <Browser />
            </div>
          </Show>
        }
      >
        <article class="card choice is-single" aria-labelledby="h-reconnect">
          <span class="choice-glyph" aria-hidden="true">
            <Icon name="laptop" />
          </span>
          <h2 id="h-reconnect">Reconectar la carpeta</h2>
          <p>
            El navegador recuerda qué carpeta era, pero el permiso caduca al cerrar todas las
            pestañas: hace falta un clic tuyo para devolverlo.
          </p>
          <div class="choice-actions">
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
            <button
              type="button"
              class="secondary"
              disabled={busy()}
              onClick={() => void run(openDirectoryLedger)}
            >
              Elegir otra carpeta
            </button>
          </div>
        </article>
      </Show>
    </div>
  );
}
