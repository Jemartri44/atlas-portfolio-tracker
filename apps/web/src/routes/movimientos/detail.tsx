// "¿Qué dice exactamente este evento y sigue vigente?"
//
// Every field with a legible name, the state in words, the cross references as
// links and the identifier ready to copy — which is what `atlas edit` or
// `atlas delete` need from a terminal (FR-040). Rectifying lives here too,
// because this is where the user realises something is wrong.

import { ledgerEntries } from "@atlas/domain";
import { A, useNavigate, useParams } from "@solidjs/router";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { Figure } from "../../components/Figure.jsx";
import { Amount, Badge, Callout, Dialog, EmptyState, Field } from "../../components/index.js";
import { formatDate, formatInstantDate } from "../../format/date.js";
import { reverse } from "../../ledger/actions.js";
import { store } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { detailView } from "../../view-models/index.js";
import { RequireLedger } from "../guard.jsx";

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
                <EmptyState what={`No hay ningún evento con el identificador ${params.id}.`}>
                  <A href="/movimientos">Volver al libro</A>
                </EmptyState>
              </>
            }
          >
            {(found) => {
              const view = createMemo(() => detailView(found()));
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
                          <button type="button" class="secondary" onClick={() => setAsking(true)}>
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

                  <Show when={view().invalidReason !== undefined}>
                    <Callout tone="error" title="Este evento es inválido">
                      {view().invalidReason}
                    </Callout>
                  </Show>

                  <Show when={dependents().length > 0}>
                    <Callout tone="error" title="Hay eventos que dependen de este">
                      <p>Rectifícalos antes; el libro nunca se queda incoherente (ADR-0003).</p>
                      <ul>
                        <For each={dependents()}>
                          {(item) => (
                            <li>
                              <A href={`/movimientos/${item.id}`}>{item.type}</A>: {item.error}
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

                    <section class="card">
                      <header>
                        <h2>Datos del evento</h2>
                      </header>
                      <dl class="fields">
                        <For each={view().fields}>
                          {(field) => (
                            <>
                              <dt>{field.label}</dt>
                              <dd>
                                <Show when={field.kind === "amount"}>
                                  <Amount value={field.amount} />
                                </Show>
                                <Show when={field.kind === "quantity"}>
                                  <Amount quantity={field.quantity} />
                                </Show>
                                <Show when={field.kind === "date"}>
                                  {formatDate(field.text as string)}
                                </Show>
                                <Show when={field.kind === "percent"}>
                                  <Figure value={field.text} unit="percent" />
                                </Show>
                                <Show when={field.kind === "json"}>
                                  <pre>
                                    <code>{field.text}</code>
                                  </pre>
                                </Show>
                                <Show when={field.kind === "id" || field.kind === "text"}>
                                  {field.text}
                                </Show>
                              </dd>
                            </>
                          )}
                        </For>
                      </dl>
                    </section>

                    <Show when={view().links.length > 0}>
                      <section class="card">
                        <header>
                          <h2>Enlaces</h2>
                        </header>
                        <dl class="fields">
                          <For each={view().links}>
                            {(link) => (
                              <>
                                <dt>{link.label}</dt>
                                <dd>
                                  <A href={link.to}>{link.text}</A>
                                </dd>
                              </>
                            )}
                          </For>
                        </dl>
                      </section>
                    </Show>

                    <section class="card">
                      <header>
                        <h2>La línea del libro</h2>
                      </header>
                      <dl class="fields">
                        <For each={view().envelope}>
                          {(field) => (
                            <>
                              <dt>{field.label}</dt>
                              <dd>
                                <Show
                                  when={field.name === "recorded_at"}
                                  fallback={<code>{field.text}</code>}
                                >
                                  {formatInstantDate(field.text as string)}
                                </Show>
                              </dd>
                            </>
                          )}
                        </For>
                      </dl>
                      <p class="note">
                        Posición en el fichero: {found().position + 1}. Con este identificador
                        puedes rectificar también desde la CLI.
                      </p>
                    </section>
                  </div>

                  <Dialog
                    open={asking()}
                    title="Anular el evento"
                    onClose={() => setAsking(false)}
                    actions={
                      <>
                        <button type="button" class="secondary" onClick={() => setAsking(false)}>
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={reason().trim() === "" || store.writing()}
                          onClick={() => void onReverse()}
                        >
                          Anular
                        </button>
                      </>
                    }
                  >
                    <p>
                      El libro es append-only: no se borra nada. Se escribe una anulación que deja
                      este evento sin efecto (ADR-0003).
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
