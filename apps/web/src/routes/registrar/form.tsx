// "¿Queda bien antes de escribirlo?" — the form of one event type.
//
// With `?borrador=<id>` it records a draft: the form comes filled with the draft's values and
// **without** a rate, so the history proposes the official one as for any other
// operation, and the write goes through every validation of a record.

import { useParams, useSearchParams } from "@solidjs/router";
import { createResource, type JSX, lazy, Show } from "solid-js";
import { type AppError, today } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { type EventFormSpec, formSpec, valuesOfEvent } from "../../view-models/forms/index.js";
import { RequireLedger } from "../guard.jsx";
import { EventForm } from "./EventForm.jsx";
import { NoForm } from "./FormNotices.jsx";
import { proposedAmount } from "./prefill.js";

type Found =
  | { kind: "draft"; id: string; values: ReturnType<typeof valuesOfEvent> }
  | { kind: "gone" }
  | { kind: "failed"; error: AppError };

const draftFor = async (
  id: string | undefined,
  spec: EventFormSpec | undefined,
): Promise<Found | undefined> => {
  if (id === undefined || spec === undefined) {
    return undefined;
  }
  try {
    const draft = await (await import("../../drafts/store.js")).findDraft(id);
    return draft === undefined || draft.event.type !== spec.type
      ? { kind: "gone" }
      : { kind: "draft", id, values: valuesOfEvent(spec, draft.event) };
  } catch (error) {
    return { kind: "failed", error: (await import("../../ledger/errors.js")).toAppError(error) };
  }
};

/**
 * `/registrar/borradores` is the list of drafts, served by this route and not
 * by one of its own: a route in the table of the entry costs the boot about a
 * hundred bytes, and the list is not the boot's.
 */
const Borradores = lazy(() => import("./borradores.jsx"));
const DRAFTS_SLUG = "borradores";

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
  const [search] = useSearchParams<{
    borrador?: string;
    cuenta?: string;
    activo?: string;
    repetir?: string;
  }>();
  // «Repetir la compra del mes»: the address carries the account and the asset, never an amount
  // (nothing of the portfolio in the history of the browser, ADR-0035); the amount is the plan's,
  // asked again here. Only plain strings: a repeated parameter arrives as a list, and is ignored.
  const one = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;
  const prefill = (amount: string | undefined): Record<string, string> => {
    const [account, asset] = [one(search.cuenta), one(search.activo)];
    return {
      ...(account === undefined ? {} : { account_id: account }),
      ...(asset === undefined ? {} : { asset_id: asset }),
      ...(amount === undefined ? {} : { amount }),
    };
  };
  const repeated = (): string | false =>
    one(search.repetir) === "1" ? (one(search.activo) ?? false) : false;
  const spec = () => formSpec(params.tipo);
  const [fromDraft] = createResource(
    () => [search.borrador, spec()] as const,
    ([id, found]) => draftFor(id, found),
  );
  return (
    <RequireLedger writes skeleton={8}>
      {(snapshot) => {
        const [proposed] = createResource(repeated, (asset) =>
          proposedAmount(snapshot.events, asset, today()),
        );
        return (
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
                          ? `No se ha podido leer el borrador: ${(fromDraft() as Extract<Found, { kind: "failed" }>).error.message}`
                          : "Ese borrador ya no está pendiente: puede que ya se registrara o se descartara."
                      }
                    />
                  }
                >
                  <PageHeader title={found().title} lead={found().when} />
                  <Show when={!proposed.loading}>
                    <EventForm
                      spec={found()}
                      state={snapshot.state}
                      events={snapshot.events}
                      prefill={prefill(proposed.error ? undefined : proposed())}
                      fromDraft={
                        fromDraft()?.kind === "draft"
                          ? (fromDraft() as Extract<Found, { kind: "draft" }>)
                          : undefined
                      }
                    />
                  </Show>
                </Show>
              </Show>
            )}
          </Show>
        );
      }}
    </RequireLedger>
  );
};
