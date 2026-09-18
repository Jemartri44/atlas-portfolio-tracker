// "¿Dónde está mi libro y cómo está configurado?" — the hub: the ledger (where
// it is, export, import, change), privacy and theme, and the way into the
// configuration and the verification.

import { BrowserLedgerBlob } from "@atlas/adapters/browser";
import { A } from "@solidjs/router";
import { createSignal, type JSX, Show } from "solid-js";
import { Callout, Section, Switch } from "../../components/index.js";
import { formatInstantDate } from "../../format/date.js";
import { changeLedger } from "../../ledger/actions.js";
import { toAppError } from "../../ledger/errors.js";
import { exportLedger, importLedger } from "../../ledger/export.js";
import { type BrowserSource, daysSinceExport, sourceLabel } from "../../ledger/source.js";
import { store, today } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";

export default function AjustesRoute(): JSX.Element {
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal<string | undefined>(undefined);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const source = () => store.source();

  /** The ledger when it lives inside the browser: the only case that exports. */
  const stored = (): BrowserSource | undefined => {
    const current = source();
    return current?.kind === "browser" ? current : undefined;
  };

  const onExport = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await exportLedger(new BrowserLedgerBlob());
      setMessage("Libro exportado. Guárdalo donde tengas la copia de seguridad.");
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
      const events = await importLedger(await file.text());
      setMessage(
        `Importados ${events} eventos: el libro anterior de este navegador se ha sustituido.`,
      );
    } catch (failure) {
      setError(toAppError(failure).message);
    } finally {
      setBusy(false);
      input.value = "";
    }
  };

  return (
    <>
      <PageHeader title="Ajustes" />

      <Show when={message() !== undefined}>
        <Callout tone="info" title="Hecho">
          {message()}
        </Callout>
      </Show>
      <Show when={error() !== undefined}>
        <Callout tone="error" title="No se ha podido">
          {error()}
        </Callout>
      </Show>

      <div class="stack">
        <Section title="El libro">
          <Show when={source()} fallback={<p>No hay ningún libro abierto.</p>}>
            {(current) => (
              <>
                <dl class="fields">
                  <dt>Dónde está</dt>
                  <dd>{sourceLabel(current())}</dd>
                  <Show when={stored()}>
                    {(browser) => (
                      <>
                        <dt>Última exportación</dt>
                        <dd>
                          <Show when={browser().lastExportAt} fallback={<strong>nunca</strong>}>
                            {(when) => (
                              <>
                                {formatInstantDate(when())} (hace{" "}
                                {daysSinceExport(browser(), today())} días)
                              </>
                            )}
                          </Show>
                        </dd>
                        <dt>Almacenamiento persistente</dt>
                        <dd>
                          {browser().persisted
                            ? "concedido por el navegador"
                            : "no concedido: exporta con más frecuencia"}
                        </dd>
                      </>
                    )}
                  </Show>
                  <Show when={store.snapshot()}>
                    {(snapshot) => (
                      <>
                        <dt>Eventos</dt>
                        <dd>{snapshot().events.length}</dd>
                      </>
                    )}
                  </Show>
                </dl>

                <Show when={stored() !== undefined}>
                  <p class="subtle">
                    El libro vive en el navegador: <strong>no es un almacén definitivo</strong>. Si
                    borras los datos del sitio, se va con ellos.
                  </p>
                  <div class="row wrap">
                    <button type="button" disabled={busy()} onClick={() => void onExport()}>
                      Exportar el libro
                    </button>
                    <label class="row flush">
                      <span class="subtle">Importar y sustituir:</span>
                      <input
                        type="file"
                        accept=".jsonl,.json,application/x-ndjson,text/plain"
                        disabled={busy()}
                        onChange={(event) => void onImport(event)}
                        class="file-input"
                      />
                    </label>
                  </div>
                </Show>

                <div class="row wrap spaced">
                  <A href="/libro" role="button" class="secondary">
                    Cambiar de libro
                  </A>
                  <button
                    type="button"
                    class="secondary outline"
                    disabled={busy()}
                    onClick={() => void changeLedger()}
                  >
                    Cerrar el libro
                  </button>
                </div>
              </>
            )}
          </Show>
        </Section>

        <Section title="Privacidad y apariencia">
          <Switch
            id="privacy-setting"
            label="Ocultar importes y cantidades"
            checked={store.privacy()}
            onChange={(checked) => store.setPrivacy(checked)}
            hint="Activado por defecto. Los porcentajes, los pesos y las fechas siguen visibles."
          />
          <div class="field">
            <label for="theme">Tema</label>
            <select
              id="theme"
              value={store.theme()}
              onChange={(event) =>
                store.setTheme(event.currentTarget.value as "system" | "light" | "dark")
              }
            >
              <option value="system">El del sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </div>
        </Section>

        <Section title="Configuración y verificación">
          <div class="datalist">
            <A href="/ajustes/configuracion" class="item">
              <span class="head">
                <span class="title">Configuración</span>
              </span>
              <span class="sub">
                Umbrales, pesos objetivo, porcentaje del cubo, fecha fiscal y ventana de recompra.
              </span>
            </A>
            <A href="/ajustes/verificacion" class="item">
              <span class="head">
                <span class="title">Verificación</span>
              </span>
              <span class="sub">
                Comprueba que el libro está íntegro: posiciones, lotes, huellas y referencias.
              </span>
            </A>
          </div>
        </Section>
      </div>
    </>
  );
}
