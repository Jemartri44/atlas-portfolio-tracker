// «Borradores»: the operations kept before the ECB published their rate
// (feature 012, block 5; ADR-0029, point 9).
//
// A draft is not a fact: it counts in no figure, it is always shown as
// pending, and it is **never recorded by itself** — not even when the history
// already has its rate. When it does, the list says so and offers the form
// with the draft's values, where the official rate is proposed as for any
// other operation and the write goes through every validation of a record.
//
// The drafts are in the cloud, the same ones for every device and for the
// console; nothing of them is kept on this device. Discarding or confirming
// closes them there: nothing is deleted.
//
// Amounts are not shown here: what tells a draft apart is what, where and
// when, and a list that never masks nothing never leaks anything.

import type { Ulid } from "@atlas/domain";
import { A, useSearchParams } from "@solidjs/router";
import { createResource, createSignal, For, type JSX, Show } from "solid-js";
import { ConfirmDialog, EmptyState, Notice, Section } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { EVENT_LABELS } from "../../format/labels.js";
import { nameIndex } from "../../format/names.js";
import { formatExact } from "../../format/number.js";
import { closeDraft, drafts } from "../../ledger/draft-store.js";
import { toAppError } from "../../ledger/errors.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { FORM_SPECS } from "../../view-models/forms/index.js";
import { RequireLedger } from "../guard.jsx";
import { type DraftRow, draftRows } from "./draft-rows.js";

const StatusLine = (props: { row: DraftRow }): JSX.Element => {
  const status = () => props.row.status;
  return (
    <p class="card-note">
      {(() => {
        if (props.row.recorded.length > 0) {
          return "Ya está en tus datos: se registró, pero el borrador no se cerró. Ciérralo; no se registrará dos veces.";
        }
        const current = status();
        switch (current.kind) {
          case "no_history":
            return "Sin histórico del BCE en este dispositivo no se puede saber si ya se publicó el tipo. En Ajustes puedes bajarlo de la nube o importarlo.";
          case "waiting":
            return current.rates
              .map(
                (rate) =>
                  `Esperando el tipo de ${rate.currency} del ${formatDate(rate.reference)}: el histórico llega hasta el ${formatDate(rate.latest)}.`,
              )
              .join(" ");
          case "confirmable":
            return `El BCE ya ha publicado el tipo: ${current.rates
              .map(
                (rate) =>
                  `${formatExact(rate.rate)} ${rate.currency} por euro del ${formatDate(rate.date)}`,
              )
              .join(", ")}. Puedes registrarlo.`;
          case "needs_rate":
            return `El BCE no publica ${current.currencies.join(", ")} para esa fecha: no habrá tipo oficial que proponer. Descártalo y regístralo tecleando el tipo.`;
        }
      })()}
    </p>
  );
};

export default function BorradoresRoute(): JSX.Element {
  const [search] = useSearchParams<{ guardado?: string; ya?: string; "no-quitado"?: string }>();
  const [listed, { refetch }] = createResource(() => drafts().list());
  const [history] = createResource(async () =>
    (await import("../../ecb/history.js")).loadWebHistory(),
  );
  const [discarding, setDiscarding] = createSignal<DraftRow | undefined>(undefined);
  const [refused, setRefused] = createSignal<string | undefined>(undefined);

  /** One that is in the ledger already is closed as confirmed; any other, as discarded. */
  const discard = async (row: DraftRow): Promise<void> => {
    setDiscarding(undefined);
    setRefused(undefined);
    try {
      await closeDraft(
        row.draft.id,
        row.recorded[0] === undefined
          ? { outcome: "discarded" }
          : { outcome: "confirmed", eventId: row.recorded[0] as Ulid },
      );
    } catch (error) {
      setRefused(toAppError(error).message);
    }
    await refetch();
  };

  return (
    <RequireLedger skeleton={4}>
      {(snapshot) => {
        const rows = (): DraftRow[] =>
          draftRows(listed()?.drafts ?? [], snapshot.state, snapshot.events, history());
        const names = nameIndex(snapshot.state);
        return (
          <>
            <PageHeader
              title="Borradores"
              lead="Operaciones guardadas antes de que el BCE publique su tipo. No cuentan en ninguna cifra hasta que las registras."
            />
            <div class="stack">
              <Show when={search["no-quitado"]}>
                <Notice severity="caution" title="Registrado, pero el borrador sigue aquí">
                  El movimiento se ha registrado, pero no se ha podido cerrar su borrador. Ciérralo
                  abajo: confirmarlo otra vez no lo registra dos veces, solo lo cierra.
                </Notice>
              </Show>
              <Show when={search.ya}>
                <Notice severity="info" title="Ese borrador ya estaba registrado">
                  Estaba en tus datos desde una confirmación anterior: se ha cerrado el borrador sin
                  registrarlo otra vez.
                </Notice>
              </Show>
              <Show when={search.guardado}>
                <Notice severity="info" title="Borrador guardado">
                  Cuando el BCE publique el tipo, aparecerá aquí listo para registrarlo con el tipo
                  oficial. No se registra solo.
                </Notice>
              </Show>
              <Notice severity="info" title="Están en tu cuenta">
                Los ves desde cualquier dispositivo y desde la consola, y no se guardan en este. La
                exportación del libro no los incluye: no son movimientos.
              </Notice>
              <Show when={refused()}>
                {(said) => (
                  <Notice severity="caution" title="No se ha cerrado el borrador">
                    {said()}
                  </Notice>
                )}
              </Show>
              <Show when={listed.error}>
                <Notice severity="caution" title="No se han podido leer los borradores">
                  {toAppError(listed.error).message.replace(" No se ha guardado nada.", "")} Tus
                  borradores no se han tocado.
                </Notice>
              </Show>
              <Show
                when={listed.state === "ready" && history.state === "ready"}
                fallback={
                  <Show when={listed.state !== "errored"}>
                    <p class="card-note">Leyendo los borradores…</p>
                  </Show>
                }
              >
                <Show
                  when={rows().length > 0 || (listed()?.unreadable.length ?? 0) > 0}
                  fallback={<EmptyState what="No hay borradores pendientes." />}
                >
                  <div class="stack">
                    <For each={rows()}>
                      {(row) => {
                        const spec = FORM_SPECS.find((one) => one.type === row.draft.event.type);
                        const type = String(row.draft.event.type);
                        const subject =
                          row.subject === undefined
                            ? ""
                            : ` · ${names[row.subject] ?? row.subject}`;
                        return (
                          <Section
                            title={`${EVENT_LABELS[type] ?? type}${subject}`}
                            aside={`${formatDate(row.date)} · ${row.currency}`}
                          >
                            <StatusLine row={row} />
                            <div class="button-row">
                              <Show
                                when={
                                  row.status.kind === "confirmable" &&
                                  row.recorded.length === 0 &&
                                  spec
                                }
                              >
                                {(found) => (
                                  <A
                                    href={`/registrar/${found().slug}?borrador=${row.draft.id}`}
                                    role="button"
                                  >
                                    Revisar y registrar
                                  </A>
                                )}
                              </Show>
                              <button
                                type="button"
                                class="secondary"
                                onClick={() => setDiscarding(row)}
                              >
                                {row.recorded.length > 0 ? "Cerrar" : "Descartar"}
                              </button>
                            </div>
                          </Section>
                        );
                      }}
                    </For>
                    <For each={listed()?.unreadable ?? []}>
                      {(key) => (
                        <Notice severity="caution" title="Un borrador no se puede leer">
                          El borrador {key} no tiene el formato esperado. No se ha tocado.
                        </Notice>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
            </div>
            <ConfirmDialog
              open={discarding() !== undefined}
              title={
                discarding()?.recorded.length ? "¿Cerrar el borrador?" : "¿Descartar el borrador?"
              }
              confirm={discarding()?.recorded.length ? "Cerrar" : "Descartar"}
              destructive
              onConfirm={() => void discard(discarding() as DraftRow)}
              onClose={() => setDiscarding(undefined)}
            >
              {discarding()?.recorded.length
                ? "Ya está registrado: no se registra nada y el borrador deja de aparecer."
                : "No se registra nada y el borrador deja de aparecer en tu cuenta."}
            </ConfirmDialog>
          </>
        );
      }}
    </RequireLedger>
  );
}
