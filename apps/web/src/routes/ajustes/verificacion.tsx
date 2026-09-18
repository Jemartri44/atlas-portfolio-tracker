// "¿Está sano mi libro?" — `integrity` always, and the deep check on request
// because it re-reads the raw lines and re-projects (`deepCheck`), which is
// heavier and only makes sense when asked for.
//
// Findings are explained in Spanish and each one names its events, which is how
// a degraded ledger gets repaired: read, check, rectify.

import { deepCheck, type IntegrityFinding, integrity } from "@atlas/domain";
import { A } from "@solidjs/router";
import { createSignal, For, type JSX, Show } from "solid-js";
import { Badge, Callout } from "../../components/index.js";
import { type EventReferences, eventReferences } from "../../format/events.js";
import { describeError } from "../../format/messages/errors.js";
import { describeFinding } from "../../format/messages/findings.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { nameIndex } from "../../format/names.js";
import { maskFigures } from "../../format/privacy.js";
import { usePrivacy } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { RequireLedger } from "../guard.jsx";

const Findings = (props: {
  findings: readonly IntegrityFinding[];
  privacy: boolean;
  events: EventReferences;
}): JSX.Element => (
  <div class="stack">
    <For each={props.findings}>
      {(finding) => (
        <div class={`callout is-${finding.severity === "error" ? "error" : "warning"}`}>
          <span class="title">
            <Badge tone={finding.severity === "error" ? "negative" : "warning"}>
              {finding.severity === "error" ? "error" : "aviso"}
            </Badge>{" "}
            {describeFinding(finding).what}
          </span>
          <span>{describeFinding(finding).todo}</span>
          {/*
            The domain's own message carries the evidence — which asset, which
            line, which figure — and it is in English by contract (`errors.ts`).
            It goes folded, like the code of an error: the explanation is
            Spanish, the evidence is raw.
          */}
          <details class="technical">
            <summary class="tiny">Detalle técnico</summary>
            <p class="tiny flush">
              <code>{finding.code}</code> · {maskFigures(finding.message, props.privacy)}
            </p>
          </details>
          <Show when={finding.event_ids.length > 0}>
            <span class="tiny">
              <For each={finding.event_ids}>
                {(id, index) => (
                  <>
                    <Show when={index() > 0}>, </Show>
                    <A href={`/movimientos/${id}`}>{props.events(id)}</A>
                  </>
                )}
              </For>
            </span>
          </Show>
        </div>
      )}
    </For>
  </div>
);

export default function VerificacionRoute(): JSX.Element {
  const [deep, setDeep] = createSignal<IntegrityFinding[] | undefined>(undefined);
  const privacy = usePrivacy();

  return (
    <RequireLedger skeleton={5}>
      {(snapshot) => {
        const names = nameIndex(snapshot.state);
        const events = eventReferences(snapshot.events);
        const findings = () => integrity(snapshot.state);
        const invalid = () => snapshot.state.invalid;

        return (
          <>
            <PageHeader
              title="Verificación"
              lead={`${snapshot.events.length} eventos leídos. Todo lo que ves se recalcula desde el libro.`}
            />

            <div class="stack">
              <Show when={invalid().length > 0}>
                <section class="card">
                  <header>
                    <h2>Eventos inválidos</h2>
                    <Badge tone="negative">{invalid().length}</Badge>
                  </header>
                  <p class="subtle">
                    Mientras los haya, se puede consultar pero no registrar. Rectifica cada uno
                    desde su ficha.
                  </p>
                  <div class="stack">
                    <For each={invalid()}>
                      {(entry) => (
                        <div class="callout is-error">
                          <span class="title">
                            <A href={`/movimientos/${entry.event.id}`}>{events(entry.event.id)}</A>
                          </span>
                          <span class="subtle">
                            {describeError(entry.error, { names, privacy: privacy() })}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </Show>

              <section class="card">
                <header>
                  <h2>Integridad</h2>
                  <Show when={findings().length === 0}>
                    <Badge tone="positive">sin hallazgos</Badge>
                  </Show>
                </header>
                <Show
                  when={findings().length > 0}
                  fallback={
                    <p class="flush">
                      Posiciones no negativas, lotes cuadrados, huellas únicas y ninguna referencia
                      colgante.
                    </p>
                  }
                >
                  <Findings findings={findings()} privacy={privacy()} events={events} />
                </Show>
              </section>

              <section class="card">
                <header>
                  <h2>Comprobación profunda</h2>
                  <button
                    type="button"
                    class="secondary"
                    onClick={() =>
                      setDeep(deepCheck(snapshot.lines, snapshot.events, snapshot.state))
                    }
                  >
                    {deep() === undefined ? "Ejecutar" : "Volver a ejecutar"}
                  </button>
                </header>
                <p class="subtle">
                  Relee las líneas tal cual están en el fichero: identificadores repetidos, huellas
                  que no cuadran, líneas no canónicas, campos desconocidos y proyección
                  reproducible.
                </p>
                <Show when={deep()}>
                  {(found) => (
                    <Show
                      when={found().length > 0}
                      fallback={<p class="flush">Sin hallazgos: el libro es reproducible.</p>}
                    >
                      <Findings findings={found()} privacy={privacy()} events={events} />
                    </Show>
                  )}
                </Show>
              </section>

              <Show when={snapshot.state.warnings.length > 0}>
                <section class="card">
                  <header>
                    <h2>Avisos del libro</h2>
                    <span class="tiny">{snapshot.state.warnings.length}</span>
                  </header>
                  <div class="stack">
                    <For each={snapshot.state.warnings}>
                      {(warning) => (
                        <div class="callout is-warning">
                          <span class="subtle">
                            {describeWarning(warning, { names, privacy: privacy() })}
                          </span>
                          <span class="tiny">
                            <A href={`/movimientos/${warning.event_id}`}>
                              {events(warning.event_id)}
                            </A>
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </Show>

              <Callout tone="info" title="La copia de seguridad sigue siendo tuya">
                La verificación dice si el libro es coherente, no si está a salvo. Exporta desde
                Ajustes, y en el ordenador usa <code>atlas backup</code>.
              </Callout>
            </div>
          </>
        );
      }}
    </RequireLedger>
  );
}
