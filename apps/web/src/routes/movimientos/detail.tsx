// "¿Qué dice exactamente este movimiento y sigue vigente?"
//
// It opens with one sentence — what happened, for how much, when and where —
// and then every field with a legible name, the state in words, the linked
// movements as rows and the identifier ready to copy in the folded technical
// record, which is what `atlas edit` or `atlas delete` need from a terminal
// (FR-040, docs/design/system.md §7.3). Rectifying lives here too, because this
// is where the user realises something is wrong: «Corregir» is secondary and
// «Anular» destructive, never the look of a main action.

import { ledgerEntries } from "@atlas/domain";
import type { ClosedYearImpact } from "@atlas/domain/fiscal";
import { A, useNavigate, useParams } from "@solidjs/router";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import {
  ClosedYearNotice,
  Dialog,
  EmptyState,
  Field,
  Notice,
  Parts,
  Tag,
} from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { eventReferences } from "../../format/events.js";
import { nameIndex } from "../../format/names.js";
import { store } from "../../ledger/state.js";
import { closedYearsOfReversal, reverse } from "../../ledger/write.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { detailView } from "../../view-models/index.js";
import { saleResult } from "../../view-models/sale.js";
import { movementSentence } from "../../view-models/sentence.js";
import { RequireLedger } from "../guard.jsx";
import { EventEnvelope, EventLinks, Facts, SaleResult } from "./DetailFields.jsx";
import { doneUrl, Rectified } from "./Rectified.jsx";

export default function MovimientoDetalleRoute(): JSX.Element {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [reason, setReason] = createSignal("");
  const [asking, setAsking] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [closedYears, setClosedYears] = createSignal<readonly ClosedYearImpact[]>([]);
  const [dependents, setDependents] = createSignal<
    readonly { id: string; type: string; error: string }[]
  >([]);

  /**
   * Which filed returns this annulment would reach, computed when the dialog
   * opens and not after writing: it is the only moment it is useful (FR-018).
   * The reason does not change a figure, so the candidate is built with a
   * placeholder when the field is still empty.
   */
  const askToReverse = (): void => {
    setAsking(true);
    setClosedYears([]);
    void closedYearsOfReversal(params.id, reason().trim() === "" ? "anulación" : reason()).then(
      setClosedYears,
    );
  };

  const onReverse = async (): Promise<void> => {
    setError(undefined);
    const result = await reverse(params.id, reason().trim());
    if (result.ok) {
      setAsking(false);
      // To the reversal it wrote, with the confirmation in the address.
      navigate(doneUrl(result.value.reversal.id, "anulado", result.value.priorYear));
      return;
    }
    if (result.failure.kind === "dependents") {
      setDependents(result.failure.affected);
      setAsking(false);
      return;
    }
    setError(
      result.failure.kind === "conflict"
        ? "Tus datos han cambiado desde que se cargaron: se han recargado, vuelve a intentarlo."
        : result.failure.kind === "error"
          ? result.failure.error.message
          : "No se ha podido anular.",
    );
  };

  return (
    <RequireLedger skeleton={6}>
      {(snapshot) => {
        // A memo, not an arrow: `ledgerEntries` projects and sorts the whole
        // ledger (10,66 ms with 5.000 events), and this is read four times per
        // render — a tenth of a second on a phone each time a signal changes.
        const entry = createMemo(() =>
          ledgerEntries(snapshot.state, snapshot.events).find(
            (candidate) => candidate.event.id === params.id,
          ),
        );
        const names = nameIndex(snapshot.state);
        const refs = eventReferences(snapshot.events, names);

        return (
          <Show
            when={entry()}
            fallback={
              <>
                <PageHeader title="Movimiento" />
                <EmptyState glyph="movements" what="Ese movimiento no está en tus datos.">
                  <A href="/movimientos" role="button" class="secondary">
                    Volver a los movimientos
                  </A>
                </EmptyState>
              </>
            }
          >
            {(found) => {
              const view = createMemo(() => detailView(found(), names, refs));
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
                          <button type="button" class="danger" onClick={() => askToReverse()}>
                            Anular
                          </button>
                        </Show>
                      </>
                    }
                  />

                  <Rectified />

                  <Show when={error() !== undefined}>
                    <Notice severity="danger" title="No se ha podido rectificar">
                      {error()}
                    </Notice>
                  </Show>

                  <Show when={view().editHint}>
                    {(hint) => (
                      <Notice severity="info" title="Este evento no se corrige">
                        {hint()}
                      </Notice>
                    )}
                  </Show>

                  <Show when={view().invalidReason !== undefined}>
                    <Notice severity="danger" title="Este evento es inválido">
                      {view().invalidReason}
                    </Notice>
                  </Show>

                  <Show when={dependents().length > 0}>
                    <Notice severity="danger" title="Hay movimientos que dependen de este">
                      <p>
                        Anúlalos o corrígelos antes: si este desapareciera, dejarían de cuadrar.
                      </p>
                      <ul>
                        <For each={dependents()}>
                          {(item) => (
                            <li>
                              <A href={`/movimientos/${item.id}`}>{refs(item.id)}</A>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Notice>
                  </Show>

                  <div class="grid">
                    <section class="card span-8" aria-label="El movimiento">
                      <p class="sentence">
                        <Parts parts={movementSentence(found(), names, refs)} />
                      </p>
                      <Show when={view().status !== "current"}>
                        <p>
                          <Tag icon={view().status === "reversed" ? "reversed" : undefined}>
                            {view().statusLabel}
                          </Tag>
                        </p>
                      </Show>
                      <h2 class="block-title">Datos</h2>
                      <Facts fields={view().fields} />
                      <SaleResult view={saleResult(snapshot.state.gains, view().id, names)} />
                      <EventEnvelope
                        envelope={view().envelope}
                        technical={view().technical}
                        position={found().position}
                        identifiers={view().fields.filter((field) => field.hint !== undefined)}
                      />
                    </section>
                    <EventLinks links={view().links} />
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
                          class="danger solid"
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
                      efecto. El original sigue en tus datos, marcado como anulado.
                    </p>
                    <ClosedYearNotice impacts={closedYears()} />
                    <Field
                      id="reverse-reason"
                      kind="text"
                      label="Motivo"
                      required
                      hint="Queda registrado junto a la anulación."
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
