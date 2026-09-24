// "¿Queda bien antes de escribirlo?" — the form of one event type.
//
// With `?borrador=<id>` it records a draft (feature 012, block 5): the form
// comes filled with the draft's values and **without** a rate, so the history
// proposes the official one as for any other operation, and the write goes
// through every validation of a record.

import { useParams, useSearchParams } from "@solidjs/router";
import { createResource, type JSX, Show } from "solid-js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { type EventFormSpec, formSpec, valuesOfEvent } from "../../view-models/forms/index.js";
import { RequireLedger } from "../guard.jsx";
import { EventForm } from "./EventForm.jsx";
import { NoForm } from "./FormNotices.jsx";

const draftFor = async (id: string | undefined, spec: EventFormSpec | undefined) => {
  if (id === undefined || spec === undefined) {
    return undefined;
  }
  const draft = await (await import("../../ledger/draft-store.js")).findDraft(id);
  return draft === undefined || draft.event.type !== spec.type
    ? null
    : { id, values: valuesOfEvent(spec, draft.event) };
};

export default function RegistrarFormRoute(): JSX.Element {
  const params = useParams<{ tipo: string }>();
  const [search] = useSearchParams<{ borrador?: string }>();
  const spec = () => formSpec(params.tipo);
  const [fromDraft] = createResource(
    () => [search.borrador, spec()] as const,
    ([id, found]) => draftFor(id, found),
  );
  return (
    <RequireLedger writes skeleton={8}>
      {(snapshot) => (
        <Show
          when={spec()}
          fallback={
            <NoForm title="Registrar" what={`No hay ningún formulario para "${params.tipo}".`} />
          }
        >
          {(found) => (
            <Show when={search.borrador === undefined || fromDraft.state === "ready"}>
              <Show
                when={fromDraft() !== null}
                fallback={
                  <NoForm
                    title={found().title}
                    what="Ese borrador ya no está en este navegador: puede que ya se registrara o se descartara."
                  />
                }
              >
                <PageHeader title={found().title} lead={found().when} />
                <EventForm
                  spec={found()}
                  state={snapshot.state}
                  events={snapshot.events}
                  fromDraft={fromDraft() ?? undefined}
                />
              </Show>
            </Show>
          )}
        </Show>
      )}
    </RequireLedger>
  );
}
