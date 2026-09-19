// "Lo registré mal": the original and the corrected side by side.
//
// Nothing in the ledger is edited, so correcting writes a reversal **plus** the
// corrected event that references it (ADR-0003). The form is the same one that
// registers, filled in with what the event says today.

import { A, useParams } from "@solidjs/router";
import { createMemo, type JSX, Show } from "solid-js";
import { EmptyState } from "../../components/index.js";
import { eventReferences } from "../../format/events.js";
import { nameIndex } from "../../format/names.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { eventFields } from "../../view-models/detail.js";
import { FORM_SPECS, valuesOfEvent } from "../../view-models/forms/index.js";
import { RequireLedger } from "../guard.jsx";
import { EventForm } from "../registrar/EventForm.jsx";
import { EventFields } from "./DetailFields.jsx";

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
                      ? "Ese movimiento no está en tus datos."
                      : "Este tipo de movimiento no se corrige desde aquí: se anula y se vuelve a registrar."
                  }
                >
                  <A href={`/movimientos/${params.id}`} role="button" class="secondary">
                    Volver al movimiento
                  </A>
                </EmptyState>
              </>
            }
          >
            {(found) => (
              <>
                <PageHeader
                  title={`Corregir ${found().spec.title.toLowerCase()}`}
                  lead="Se anula el original y se registra el corregido; nada se borra de tus datos."
                />

                <div class="stack">
                  {/*
                    The same fields as the detail, painted the same way: amounts
                    and quantities through `Amount`, dates as dd/mm/aaaa. This
                    card printed them raw — "3100", "31.2343" — with the mask on.
                  */}
                  <EventFields
                    title="Como está registrado ahora"
                    fields={
                      eventFields(
                        found().event as unknown as Record<string, unknown>,
                        nameIndex(snapshot.state),
                        eventReferences(snapshot.events),
                      ).fields
                    }
                  />

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
