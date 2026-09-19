// "¿Qué dice exactamente este evento y sigue vigente?"
//
// Every field with a legible name, the state in words, the cross references as
// links and the identifier ready to copy — which is what `atlas edit` or
// `atlas delete` need from a terminal (FR-040). Rectifying lives here too,
// because this is where the user realises something is wrong.

import { ledgerEntries } from "@atlas/domain";
import { A, useNavigate, useParams } from "@solidjs/router";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { Badge, Callout, Dialog, EmptyState, Field } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { eventReferences } from "../../format/events.js";
import { nameIndex } from "../../format/names.js";
import { store } from "../../ledger/state.js";
import { reverse } from "../../ledger/write.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { detailView } from "../../view-models/index.js";
import { RequireLedger } from "../guard.jsx";
import { EventEnvelope, EventFields, EventLinks } from "./DetailFields.jsx";

export default function MovimientoDetalleRoute(): JSX.Element {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [reason, setReason] = createSignal("");
  const [asking, setAsking] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [dependents, setDependents] = createSignal<
    readonly { id: string; type: string; error: string }[]
  >([]);
  const [priorYear, setPriorYear] = createSignal(false);

  const onReverse = async (): Promise<void> => {
    setError(undefined);
    const result = await reverse(params.id, reason().trim());
    if (result.ok) {
      setAsking(false);
      setPriorYear(result.value.priorYear);
      if (!result.value.priorYear) {
        navigate("/movimientos");
      }
      return;
    }
    if (result.failure.kind === "dependents") {
      setDependents(result.failure.affected);
      setAsking(false);
      return;
    }
    setError(
      result.failure.kind === "conflict"
        ? "El libro ha cambiado desde que se cargó: se ha recargado, vuelve a intentarlo."
        : result.failure.kind === "error"
          ? result.failure.error.message
          : "No se ha podido anular.",
    );
  };

  return (
    <RequireLedger skeleton={6}>
      {(snapshot) => {
        // A memo, not an arrow: this is read four times per render and
        // `ledgerEntries` projects and sorts the **whole** ledger. Measured:
        // 0,60 ms with the 200 events of the golden file and 10,66 ms with
        // 5.000, which at twenty years is a tenth of a second on a phone every
        // time any signal changes (turning privacy on, opening a dialog). The
        // sibling route already does it this way.
        const entry = createMemo(() =>
          ledgerEntries(snapshot.state, snapshot.events).find(
            (candidate) => candidate.event.id === params.id,
          ),
        );

        return (
          <Show
            when={entry()}
            fallback={
              <>
                <PageHeader title="Movimiento" />
                <EmptyState what="Ese movimiento no está en el libro.">
                  <A href="/movimientos">Volver al libro</A>
                </EmptyState>
              </>
            }
          >
            {(found) => {
              const view = createMemo(() =>
                detailView(found(), nameIndex(snapshot.state), eventReferences(snapshot.events)),
              );
              return (
                <>
                  <PageHeader
                    title={view().typeLabel}
                    lead={`${formatDate(found().sort_date)} · ${view().statusLabel}`}
                    actions={
                      <>
                        <Show when={view().editable}>
                          <A
                            href={`/movimientos/${view().id}/editar`}
                            role="button"
                            class="secondary"
                          >
                            Corregir
                          </A>
                        </Show>
                        <Show when={view().status !== "reversed" && view().status !== "reversal"}>
                          <button
                            type="button"
                            class="secondary outline"
                            onClick={() => setAsking(true)}
                          >
                            Anular
                          </button>
                        </Show>
                      </>
                    }
                  />

                  <Show when={priorYear()}>
                    <Callout tone="warning" title="Ejercicio anterior">
                      El evento rectificado pertenece a un ejercicio anterior: puede afectar a una
                      declaración ya presentada.
                    </Callout>
                  </Show>

                  <Show when={error() !== undefined}>
                    <Callout tone="error" title="No se ha podido rectificar">
                      {error()}
                    </Callout>
                  </Show>

                  <Show when={view().editHint}>
                    {(hint) => (
                      <Callout tone="info" title="Este evento no se corrige">
                        {hint()}
                      </Callout>
                    )}
                  </Show>

                  <Show when={view().invalidReason !== undefined}>
                    <Callout tone="error" title="Este evento es inválido">
                      {view().invalidReason}
                    </Callout>
                  </Show>

                  <Show when={dependents().length > 0}>
                    <Callout tone="error" title="Hay movimientos que dependen de este">
                      <p>
                        Anúlalos o corrígelos antes: si este desapareciera, dejarían de cuadrar.
                      </p>
                      <ul>
                        <For each={dependents()}>
                          {(item) => (
                            <li>
                              <A href={`/movimientos/${item.id}`}>
                                {eventReferences(snapshot.events)(item.id)}
                              </A>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Callout>
                  </Show>

                  <div class="stack">
                    <Show when={view().status !== "current"}>
                      <div class="row wrap">
                        <Badge tone={view().status === "reversed" ? "negative" : "neutral"}>
                          {view().statusLabel}
                        </Badge>
                      </div>
                    </Show>

                    <EventFields fields={view().fields} />
                    <EventLinks links={view().links} />
                    <EventEnvelope envelope={view().envelope} position={found().position} />
                  </div>

                  <Dialog
                    open={asking()}
                    title="Anular el movimiento"
                    onClose={() => setAsking(false)}
                    actions={
                      <>
                        <button type="button" class="secondary" onClick={() => setAsking(false)}>
                          Cancelar
                        </button>
                        <button
                          type="button"
                          class="destructive"
                          disabled={reason().trim() === "" || store.writing()}
                          onClick={() => void onReverse()}
                        >
                          Anular
                        </button>
                      </>
                    }
                  >
                    <p>
                      No se borra nada: se registra una anulación que deja este movimiento sin
                      efecto. El original sigue en el libro, marcado como anulado.
                    </p>
                    <Field
                      id="reverse-reason"
                      kind="text"
                      label="Motivo"
                      required
                      hint="Queda registrado en el libro."
                      value={reason()}
                      onInput={setReason}
                    />
                  </Dialog>
                </>
              );
            }}
          </Show>
        );
      }}
    </RequireLedger>
  );
}
