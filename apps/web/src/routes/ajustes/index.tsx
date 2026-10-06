// "¿Dónde están mis datos y cómo está configurado?" — the hub (docs/design/
// system.md §7.7): *Tus datos* (where they are and «Descargar copia»),
// *Sesión*, *Privacidad y apariencia*, and the way into the configuration and
// the verification. On a wide screen, two columns of cards.

import { A } from "@solidjs/router";
import { createSignal, For, type JSX, Show } from "solid-js";
import { Icon, type IconName, Notice, Section, Switch } from "../../components/index.js";
import { countOf } from "../../format/number.js";
import { type CopyFormat, downloadCopy } from "../../ledger/copy.js";
import { toAppError } from "../../ledger/errors.js";
import { sourceLabel } from "../../ledger/source.js";
import { store, today } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { EcbCard } from "./EcbCard.jsx";
import { PricesCard } from "./PricesCard.jsx";
import { SessionCard } from "./SessionCard.jsx";

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

  /** Only a download: the copy is read from the cloud now and nothing is kept here. */
  const onCopy = async (format: CopyFormat): Promise<void> => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const name = await downloadCopy(format, today());
      setMessage(
        `Tus datos van en ${name}. Guárdalo fuera de la nube: es la copia que este dispositivo no guarda por ti.`,
      );
    } catch (failure) {
      setError(toAppError(failure).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Ajustes" />

      <Show when={message()}>
        {(said) => (
          <Notice severity="info" title="Hecho">
            {said()}
          </Notice>
        )}
      </Show>
      <Show when={error() !== undefined}>
        <Notice severity="danger" title="No se ha podido">
          {error()}
        </Notice>
      </Show>

      <div class="grid">
        <Section title="Tus datos" class="span-6">
          <Show when={store.source()} fallback={<p class="meta">No hay datos abiertos.</p>}>
            {(current) => (
              <>
                <dl class="facts">
                  <Fact label="Dónde están">{sourceLabel(current())}</Fact>
                  <Show when={store.snapshot()}>
                    {(snapshot) => (
                      <Fact label="Movimientos registrados">
                        {countOf(snapshot().events.length, "movimiento", "movimientos")}
                      </Fact>
                    )}
                  </Show>
                </dl>
                <p class="card-note">
                  Tus datos viven en la nube de Atlas y este dispositivo no guarda ninguna copia. La
                  copia fuera de la nube es esta: descárgala de vez en cuando y guárdala donde tú
                  quieras.
                </p>
                <div class="button-row">
                  <button type="button" disabled={busy()} onClick={() => void onCopy("jsonl")}>
                    <Icon name="export" class="icon-sm" />
                    Descargar copia
                  </button>
                  <button
                    type="button"
                    class="secondary"
                    disabled={busy()}
                    onClick={() => void onCopy("csv")}
                  >
                    <Icon name="export" class="icon-sm" />
                    Descargar en CSV
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

          <div id="sincronizacion">
            <SessionCard />
          </div>
          <EcbCard />
          <PricesCard />

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
