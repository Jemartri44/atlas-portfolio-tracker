// "Tus datos" — first run, and where a ledger is brought in.
//
// **The ledger of the web lives in this browser**, on every device (feature
// 012). Until then, on a desktop, the web could write the same `ledger.jsonl`
// as the console; it no longer does, because two programs writing the same
// file could overwrite each other's line and the browser has no way to take
// the folder's lock (decision of the direction; `specs/012-ecb-reference-
// rates/questions.md`). The folder is still there to **read**: the console's
// ledger is imported from it, with a confirmation when it replaces something.
//
// One card, never dressed up as a definitive store; the consequence of having
// two ledgers until the synchronisation exists is written, not hidden. There
// is no navigation until something is open (D8).

import { useNavigate } from "@solidjs/router";
import { createSignal, type JSX, Show } from "solid-js";
import { ErrorView, Icon, Notice } from "../../components/index.js";
import { countOf } from "../../format/number.js";
import { openBrowserLedger } from "../../ledger/actions.js";
import { toAppError } from "../../ledger/errors.js";
import { canLinkFolder } from "../../ledger/source.js";
import { type AppError, store } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { ImportControls } from "./ImportControls.jsx";

export default function LibroRoute(): JSX.Element {
  const navigate = useNavigate();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [imported, setImported] = createSignal<number | undefined>(undefined);

  const phase = () => store.load();
  const isOpen = (): boolean => phase().phase === "ready";
  const retiredFolder = (): boolean => {
    const current = phase();
    return current.phase === "unconfigured" && current.retiredFolder === true;
  };
  const failedError = (): AppError | undefined => {
    const current = phase();
    return current.phase === "failed" ? current.error : undefined;
  };

  const open = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await openBrowserLedger();
      if (store.load().phase === "ready") {
        navigate("/", { replace: true });
      }
    } catch (failure) {
      setError(toAppError(failure).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="first-run">
      <PageHeader
        title={isOpen() ? "Cambiar de archivo" : "Tus datos"}
        lead="Atlas funciona en este dispositivo: sin servidor, sin cuenta, sin subir nada a ningún sitio."
      />

      <Show when={retiredFolder()}>
        <Notice severity="caution" title="La web ya no escribe en la carpeta de la consola">
          Hasta ahora, en este ordenador, la web guardaba tus datos en la misma carpeta que la
          consola. Dos programas escribiendo el mismo archivo a la vez podían pisarse una línea, y
          el navegador no tiene forma de evitarlo. Desde ahora la web guarda tus datos en este
          navegador y de la carpeta solo lee. Tu <code>ledger.jsonl</code> sigue intacto: impórtalo
          desde la carpeta para seguir aquí.
        </Notice>
      </Show>

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

      <div class="choices is-single">
        <article class="card choice" aria-labelledby="h-browser">
          <span class="choice-glyph" aria-hidden="true">
            <Icon name="browser" />
          </span>
          <h2 id="h-browser">Tus datos, en este navegador</h2>
          <p>
            Atlas guarda tus datos dentro del navegador de este dispositivo. Puedes empezar de cero
            o traer los que ya tengas: un archivo exportado o, en el ordenador, el libro de la
            consola.
          </p>
          <p class="card-note">
            <strong>No es un almacén definitivo</strong>: si borras los datos del sitio, se van con
            ellos. Expórtalos con frecuencia; Atlas te lo recordará.
          </p>
          <Show when={canLinkFolder()}>
            <p class="card-note">
              La web y la consola <strong>no comparten un libro vivo</strong>: lo que registres en
              una no aparece en la otra hasta que exportes e importes.
            </p>
          </Show>
          <div class="choice-actions">
            <button type="button" disabled={busy()} onClick={() => void open()}>
              {isOpen() ? "Seguir con los datos de este navegador" : "Empezar en este navegador"}
            </button>
          </div>
          <ImportControls
            busy={busy()}
            setBusy={setBusy}
            onError={setError}
            onImported={(events) => {
              setImported(events);
              navigate("/", { replace: true });
            }}
          />
          <Show when={imported() !== undefined}>
            <p class="card-note">
              {countOf(imported() ?? 0, "movimiento importado", "movimientos importados")}.
            </p>
          </Show>
        </article>
      </div>
    </div>
  );
}
