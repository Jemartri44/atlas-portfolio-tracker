// "Lo registré mal": the original and the corrected side by side.
//
// The ledger is append-only, so correcting writes a reversal **plus** the
// corrected event that references it (ADR-0003). The form is the same one that
// registers, filled in with what the event says today.

import { A, useParams } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { EmptyState } from "../../components/index.js";
import { fieldLabel } from "../../format/labels.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { FORM_SPECS, valuesOfEvent } from "../../view-models/forms/index.js";
import { RequireLedger } from "../guard.jsx";
import { EventForm } from "../registrar/EventForm.jsx";

export default function MovimientoEditarRoute(): JSX.Element {
  const params = useParams<{ id: string }>();

  return (
    <RequireLedger writes skeleton={8}>
      {(snapshot) => {
        const event = () => snapshot.events.find((candidate) => candidate.id === params.id);
        const spec = () => {
          const current = event();
          return current === undefined
            ? undefined
            : FORM_SPECS.find((candidate) => candidate.type === current.type);
        };

        return (
          <Show
            when={event() !== undefined && spec() !== undefined}
            fallback={
              <>
                <PageHeader title="Corregir" />
                <EmptyState
                  what={
                    event() === undefined
                      ? `No hay ningún evento con el identificador ${params.id}.`
                      : "Este tipo de evento no se corrige: se anula y se vuelve a registrar, como en la CLI."
                  }
                >
                  <A href={`/movimientos/${params.id}`}>Volver al movimiento</A>
                </EmptyState>
              </>
            }
          >
            <PageHeader
              title={`Corregir ${(spec() as NonNullable<ReturnType<typeof spec>>).title.toLowerCase()}`}
              lead="Se anula el original y se registra el corregido; nada se borra del fichero."
            />

            <div class="stack">
              <section class="card">
                <header>
                  <h2>Como está registrado ahora</h2>
                </header>
                <dl class="fields">
                  <For
                    each={Object.entries(event() as NonNullable<ReturnType<typeof event>>).filter(
                      ([name]) =>
                        !["schema_version", "id", "recorded_at", "type", "fingerprint"].includes(
                          name,
                        ),
                    )}
                  >
                    {([name, value]) => (
                      <>
                        <dt>{fieldLabel(name)}</dt>
                        <dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                      </>
                    )}
                  </For>
                </dl>
              </section>

              <EventForm
                spec={spec() as NonNullable<ReturnType<typeof spec>>}
                state={snapshot.state}
                correcting={{
                  id: params.id,
                  values: valuesOfEvent(
                    spec() as NonNullable<ReturnType<typeof spec>>,
                    event() as unknown as Record<string, unknown>,
                  ),
                }}
              />
            </div>
          </Show>
        );
      }}
    </RequireLedger>
  );
}
