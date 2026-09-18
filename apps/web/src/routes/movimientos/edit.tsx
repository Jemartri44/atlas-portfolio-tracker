// "Lo registré mal": the original and the corrected side by side.
//
// The ledger is append-only, so correcting writes a reversal **plus** the
// corrected event that references it (ADR-0003). The form is the same one that
// registers, filled in with what the event says today.

import { A, useParams } from "@solidjs/router";
import { createMemo, For, type JSX, Show } from "solid-js";
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
        const event = createMemo(() =>
          snapshot.events.find((candidate) => candidate.id === params.id),
        );

        /*
         * The event **and** its form, together: the screen only exists when
         * both are there, and resolving them in one place is what lets
         * `<Show>` narrow instead of asserting (six `as NonNullable<…>`).
         */
        const target = createMemo(() => {
          const current = event();
          if (current === undefined) {
            return undefined;
          }
          const spec = FORM_SPECS.find((candidate) => candidate.type === current.type);
          return spec === undefined ? undefined : { event: current, spec };
        });

        return (
          <Show
            when={target()}
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
            {(found) => (
              <>
                <PageHeader
                  title={`Corregir ${found().spec.title.toLowerCase()}`}
                  lead="Se anula el original y se registra el corregido; nada se borra del fichero."
                />

                <div class="stack">
                  <section class="card">
                    <header>
                      <h2>Como está registrado ahora</h2>
                    </header>
                    <dl class="fields">
                      <For
                        each={Object.entries(found().event).filter(
                          ([name]) =>
                            ![
                              "schema_version",
                              "id",
                              "recorded_at",
                              "type",
                              "fingerprint",
                            ].includes(name),
                        )}
                      >
                        {([name, value]) => (
                          <>
                            <dt>{fieldLabel(name)}</dt>
                            <dd>
                              {typeof value === "object" ? JSON.stringify(value) : String(value)}
                            </dd>
                          </>
                        )}
                      </For>
                    </dl>
                  </section>

                  <EventForm
                    spec={found().spec}
                    state={snapshot.state}
                    correcting={{
                      id: params.id,
                      values: valuesOfEvent(
                        found().spec,
                        found().event as unknown as Record<string, unknown>,
                      ),
                    }}
                  />
                </div>
              </>
            )}
          </Show>
        );
      }}
    </RequireLedger>
  );
}
