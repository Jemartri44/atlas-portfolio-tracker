// "¿Dónde están mis datos y cómo está configurado?" — the hub (docs/design/
// system.md §7.7): *Tus datos* (where they are, export, import, change of file
// and close), *Privacidad y apariencia*, and the way into the configuration and
// the verification. On a wide screen, two columns of cards.

import { BrowserLedgerBlob } from "@atlas/adapters/browser";
import { A } from "@solidjs/router";
import { createSignal, For, type JSX, Show } from "solid-js";
import { Icon, type IconName, Notice, Section, Switch } from "../../components/index.js";
import { formatInstantDate } from "../../format/date.js";
import { countOf } from "../../format/number.js";
import { changeLedger } from "../../ledger/actions.js";
import { toAppError } from "../../ledger/errors.js";
import { exportLedger } from "../../ledger/export.js";
import { type BrowserSource, daysSinceExport, sourceLabel } from "../../ledger/source.js";
import { store, today } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { ImportControls } from "../libro/ImportControls.jsx";
import { EcbCard } from "./EcbCard.jsx";

const THEMES = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
] as const;

/** Label and value, like the data of a movement. */
const Fact = (props: { label: string; children: JSX.Element }): JSX.Element => (
  <div class="fact">
    <dt>{props.label}</dt>
    <dd>{props.children}</dd>
  </div>
);

/** A row of this screen that leads somewhere: an icon, what it is and one line. */
const LinkRow = (props: {
  to: string;
  icon: IconName;
  title: string;
  children: JSX.Element;
}): JSX.Element => (
  <li>
    <A href={props.to} class="row has-lead">
      <span class="lead" aria-hidden="true">
        <Icon name={props.icon} />
      </span>
      <span class="main">
        <span class="title">{props.title}</span>
        <span class="sub">{props.children}</span>
      </span>
      <Icon name="chevright" class="icon-sm chev" />
    </A>
  </li>
);

export default function AjustesRoute(): JSX.Element {
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal<string | undefined>(undefined);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const source = () => store.source();

  /** The data when they live inside the browser: the only case that exports. */
  const stored = (): BrowserSource | undefined => {
    const current = source();
    return current?.kind === "browser" ? current : undefined;
  };

  const onExport = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await exportLedger(new BrowserLedgerBlob());
      setMessage("Datos exportados. Guarda el archivo donde tengas la copia de seguridad.");
    } catch (failure) {
      setError(toAppError(failure).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Ajustes" />

      <Show when={message() !== undefined}>
        <Notice severity="info" title="Hecho">
          {message()}
        </Notice>
      </Show>
      <Show when={error() !== undefined}>
        <Notice severity="danger" title="No se ha podido">
          {error()}
        </Notice>
      </Show>

      <div class="grid">
        <Section title="Tus datos" class="span-6">
          <Show when={source()} fallback={<p class="meta">No hay datos abiertos.</p>}>
            {(current) => (
              <>
                <dl class="facts">
                  <Fact label="Dónde están">{sourceLabel(current())}</Fact>
                  <Show when={stored()}>
                    {(browser) => (
                      <>
                        <Fact label="Última exportación">
                          <Show when={browser().lastExportAt} fallback={<strong>nunca</strong>}>
                            {(when) => (
                              <>
                                {formatInstantDate(when())} (hace{" "}
                                {countOf(daysSinceExport(browser(), today()) ?? 0, "día", "días")})
                              </>
                            )}
                          </Show>
                        </Fact>
                        <Fact label="Almacenamiento persistente">
                          {browser().persisted
                            ? "concedido por el navegador"
                            : "no concedido: exporta con más frecuencia"}
                        </Fact>
                      </>
                    )}
                  </Show>
                  <Show when={store.snapshot()}>
                    {(snapshot) => (
                      <Fact label="Movimientos registrados">
                        {countOf(snapshot().events.length, "movimiento", "movimientos")}
                      </Fact>
                    )}
                  </Show>
                </dl>

                <Show when={stored() !== undefined}>
                  <p class="card-note">
                    Tus datos viven en el navegador: <strong>no es un almacén definitivo</strong>.
                    Si borras los datos del sitio, se van con ellos.
                  </p>
                  <div class="button-row">
                    <button type="button" disabled={busy()} onClick={() => void onExport()}>
                      <Icon name="export" class="icon-sm" />
                      Exportar tus datos
                    </button>
                  </div>
                  <ImportControls
                    busy={busy()}
                    setBusy={setBusy}
                    onError={setError}
                    onImported={(events) =>
                      setMessage(
                        `${countOf(events, "movimiento importado", "movimientos importados")}: los datos que había en este navegador se han sustituido.`,
                      )
                    }
                  />
                  <p class="card-note">
                    Importar sustituye lo que haya en este navegador, y antes te pregunta.
                  </p>
                </Show>

                <div class="button-row">
                  <A href="/libro" role="button" class="secondary">
                    Cambiar de archivo
                  </A>
                  <button
                    type="button"
                    class="quiet"
                    disabled={busy()}
                    onClick={() => void changeLedger()}
                  >
                    Cerrar tus datos
                  </button>
                </div>
              </>
            )}
          </Show>
        </Section>

        <div class="stack span-6">
          <Section title="Privacidad y apariencia">
            <Switch
              id="privacy-setting"
              label="Ocultar importes y cantidades"
              checked={store.privacy()}
              onChange={(checked) => store.setPrivacy(checked)}
              hint="Activado por defecto. Los porcentajes, los pesos y las fechas siguen visibles."
            />
            <fieldset class="theme-choice">
              <legend>Tema</legend>
              <div class="segmented">
                <For each={THEMES}>
                  {(theme) => (
                    <button
                      type="button"
                      aria-pressed={store.theme() === theme.value}
                      onClick={() => store.setTheme(theme.value)}
                    >
                      <span>{theme.label}</span>
                    </button>
                  )}
                </For>
              </div>
            </fieldset>
          </Section>

          <EcbCard />

          <Section title="Configuración y verificación">
            <ul class="rows">
              {/* The fiscal screen has no place in the bottom bar (P1 of the
                  prompt): it is reached from the summary and from here. */}
              <LinkRow to="/fiscal" icon="catalogue" title="Declaración">
                La base del ahorro por ejercicio, las casillas del Modelo 100, el Modelo 720 y el
                721, y lo que ya has presentado.
              </LinkRow>
              <LinkRow to="/ajustes/configuracion" icon="settings" title="Configuración">
                Umbrales, pesos objetivo, porcentaje del cubo, fecha fiscal y ventana de recompra.
              </LinkRow>
              <LinkRow to="/ajustes/verificacion" icon="shield" title="Verificación">
                Comprueba que tus datos están íntegros: posiciones, lotes, huellas y referencias.
              </LinkRow>
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
