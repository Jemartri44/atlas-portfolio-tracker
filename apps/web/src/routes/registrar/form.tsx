// "¿Queda bien antes de escribirlo?" — the form of one event type.
//
// With `?borrador=<id>` it records a draft (feature 012, block 5; in the cloud
// since feature 027): the form comes filled with the draft's values and
// **without** a rate, so the history proposes the official one as for any other
// operation, and the write goes through every validation of a record.

import { useParams, useSearchParams } from "@solidjs/router";
import { createResource, type JSX, lazy, Show } from "solid-js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { type EventFormSpec, formSpec, valuesOfEvent } from "../../view-models/forms/index.js";
import { RequireLedger } from "../guard.jsx";
import { EventForm } from "./EventForm.jsx";
import { NoForm } from "./FormNotices.jsx";

type Found =
  | { kind: "draft"; id: string; values: ReturnType<typeof valuesOfEvent> }
  | { kind: "gone" }
  | { kind: "failed"; message: string };

const draftFor = async (
  id: string | undefined,
  spec: EventFormSpec | undefined,
): Promise<Found | undefined> => {
  if (id === undefined || spec === undefined) {
    return undefined;
  }
  try {
    const draft = await (await import("../../ledger/draft-store.js")).findDraft(id);
    return draft === undefined || draft.event.type !== spec.type
      ? { kind: "gone" }
      : { kind: "draft", id, values: valuesOfEvent(spec, draft.event) };
  } catch (error) {
    return {
      kind: "failed",
      message: (await import("../../ledger/errors.js")).toAppError(error).message,
    };
  }
};

/**
 * `/registrar/borradores` is the list of drafts, served by this route and not
 * by one of its own: a route in the table of the entry costs the boot about a
 * hundred bytes, and the list is not the boot's (review of PR #75).
 */
const Borradores = lazy(() => import("./borradores.jsx"));
export const DRAFTS_SLUG = "borradores";

export default function RegistrarFormRoute(): JSX.Element {
  const params = useParams<{ tipo: string }>();
  return (
    <Show when={params.tipo !== DRAFTS_SLUG} fallback={<Borradores />}>
      <EventFormRoute />
    </Show>
  );
}

const EventFormRoute = (): JSX.Element => {
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
            <NoForm title="Registrar" what="No hay un formulario para ese tipo de movimiento." />
          }
        >
          {(found) => (
            <Show when={search.borrador === undefined || fromDraft.state === "ready"}>
              <Show
                when={fromDraft()?.kind !== "gone" && fromDraft()?.kind !== "failed"}
                fallback={
                  <NoForm
                    title={found().title}
                    what={
                      (fromDraft() as Found | undefined)?.kind === "failed"
                        ? `No se ha podido leer el borrador: ${(fromDraft() as { message: string }).message}`
                        : "Ese borrador ya no está pendiente: puede que ya se registrara o se descartara."
                    }
                  />
                }
              >
                <PageHeader title={found().title} lead={found().when} />
                <EventForm
                  spec={found()}
                  state={snapshot.state}
                  events={snapshot.events}
                  fromDraft={
                    fromDraft()?.kind === "draft"
                      ? (fromDraft() as Extract<Found, { kind: "draft" }>)
                      : undefined
                  }
                />
              </Show>
            </Show>
          )}
        </Show>
      )}
    </RequireLedger>
  );
};
