// «Borradores»: the operations kept before the ECB published their rate
// (feature 012, block 5; ADR-0029, point 9).
//
// A draft is not a fact: it counts in no figure, it is always shown as
// pending, and it is **never recorded by itself** — not even when the history
// already has its rate. When it does, the list says so and offers the form
// with the draft's values, where the official rate is proposed as for any
// other operation and the write goes through every validation of a record.
//
// Amounts are not shown here: what tells a draft apart is what, where and
// when, and a list that never masks nothing never leaks anything.

import { A, useSearchParams } from "@solidjs/router";
import { createResource, createSignal, For, type JSX, Show } from "solid-js";
import { ConfirmDialog, EmptyState, Notice, Section } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { EVENT_LABELS } from "../../format/labels.js";
import { nameIndex } from "../../format/names.js";
import { formatExact } from "../../format/number.js";
import { discardDraft, listDrafts } from "../../ledger/draft-store.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { FORM_SPECS } from "../../view-models/forms/index.js";
import { RequireLedger } from "../guard.jsx";
import { type DraftRow, draftRows } from "./draft-rows.js";

const StatusLine = (props: { row: DraftRow }): JSX.Element => {
  const status = () => props.row.status;
  return (
    <p class="card-note">
      {(() => {
        const current = status();
        switch (current.kind) {
          case "no_history":
            return "Sin histórico del BCE en este dispositivo no se puede saber si ya se publicó el tipo. Enlaza la carpeta de la consola o importa el histórico en Ajustes.";
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
  const [search] = useSearchParams<{ guardado?: string }>();
  const [listed, { refetch }] = createResource(listDrafts);
  const [history] = createResource(async () =>
    (await import("../../ecb/history.js")).loadWebHistory(),
  );
  const [discarding, setDiscarding] = createSignal<string | undefined>(undefined);

  const discard = async (id: string): Promise<void> => {
    setDiscarding(undefined);
    await discardDraft(id);
    await refetch();
  };

  return (
    <RequireLedger skeleton={4}>
      {(snapshot) => {
        const rows = (): DraftRow[] => draftRows(listed()?.drafts ?? [], snapshot.state, history());
        const names = nameIndex(snapshot.state);
        return (
          <>
            <PageHeader
              title="Borradores"
              lead="Operaciones guardadas antes de que el BCE publique su tipo. No cuentan en ninguna cifra hasta que las registras."
            />
            <Show when={search.guardado}>
              <Notice severity="info" title="Borrador guardado">
                Cuando el BCE publique el tipo, aparecerá aquí listo para registrarlo con el tipo
                oficial. No se registra solo.
              </Notice>
            </Show>
            <Notice severity="info" title="Viven solo en este navegador">
              Si borras los datos del sitio, los borradores se pierden, igual que tus datos si no
              los has exportado. La exportación del libro no los incluye: no son movimientos.
            </Notice>
            <Show
              when={listed.state === "ready" && history.state === "ready"}
              fallback={<p class="card-note">Leyendo los borradores…</p>}
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
                        row.subject === undefined ? "" : ` · ${names[row.subject] ?? row.subject}`;
                      return (
                        <Section
                          title={`${EVENT_LABELS[type] ?? type}${subject}`}
                          aside={`${formatDate(row.date)} · ${row.currency}`}
                        >
                          <StatusLine row={row} />
                          <div class="button-row">
                            <Show when={row.status.kind === "confirmable" && spec}>
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
                              onClick={() => setDiscarding(row.draft.id)}
                            >
                              Descartar
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
            <ConfirmDialog
              open={discarding() !== undefined}
              title="¿Descartar el borrador?"
              confirm="Descartar"
              destructive
              onConfirm={() => void discard(discarding() as string)}
              onClose={() => setDiscarding(undefined)}
            >
              No se registra nada y el borrador desaparece de este navegador.
            </ConfirmDialog>
          </>
        );
      }}
    </RequireLedger>
  );
}
