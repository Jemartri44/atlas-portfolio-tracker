// «Corrección propuesta» (feature 012, block 6; criterion 25): the lines whose
// ECB rate is of another day than their fiscal date — what a change of
// `fiscal_date_rule` leaves behind —, each to be reversed and recorded again
// with the official rate. The chain is shown **whole**, with every filed
// return it reaches, **before** anything is written, and it is written in one
// write or not at all. Nothing is recalculated until then.

import type { LedgerEvent, LedgerState } from "@atlas/domain";
import { createResource, createSignal, For, type JSX, Show } from "solid-js";
import {
  ClosedYearNotice,
  ConfirmDialog,
  ErrorView,
  Notice,
  Section,
} from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { eventReferences, inSentence } from "../../format/events.js";
import { nameIndex } from "../../format/names.js";
import { countOf, formatExact } from "../../format/number.js";
import { toAppError } from "../../ledger/errors.js";
import type { AppError } from "../../ledger/state.js";

const propose = async () => (await import("../../ledger/rate-corrections.js")).proposeCorrections();

export const RateCorrections = (props: {
  state: LedgerState;
  events: readonly LedgerEvent[];
}): JSX.Element => {
  // Proposed again whenever the ledger changes (after writing, it is empty).
  const [proposal] = createResource(
    () => props.events,
    () => propose().catch((error: unknown) => ({ error: toAppError(error) })),
  );
  const [asking, setAsking] = createSignal(false);
  const [failure, setFailure] = createSignal<AppError | undefined>(undefined);
  const [written, setWritten] = createSignal(false);
  const reference = () => eventReferences(props.events, nameIndex(props.state));

  const write = async (): Promise<void> => {
    setAsking(false);
    const current = proposal();
    if (current === undefined || "error" in current) {
      return;
    }
    const { writeCorrections } = await import("../../ledger/rate-corrections.js");
    const result = await writeCorrections(current.prepared);
    if (result.ok) {
      setWritten(true);
      return;
    }
    setFailure(
      result.failure.kind === "error"
        ? result.failure.error
        : {
            code: result.failure.kind,
            message:
              "Tus datos han cambiado desde que se propuso la corrección: se han recargado y la propuesta se ha rehecho. No se ha escrito nada.",
          },
    );
  };

  return (
    <>
      <Show when={written()}>
        <Notice severity="info" title="Corrección escrita">
          Cada línea se anuló y se registró de nuevo con el tipo oficial de su fecha fiscal.
        </Notice>
      </Show>
      <Show when={failure()}>
        {(error) => <ErrorView error={error()} title="No se ha escrito la corrección" />}
      </Show>
      <Show when={proposal()}>
        {(found) => (
          <Show
            when={!("error" in found())}
            fallback={
              <ErrorView
                error={(found() as { error: AppError }).error}
                title="No se puede proponer la corrección"
              />
            }
          >
            {(() => {
              const { prepared, closed } = found() as Exclude<
                ReturnType<typeof found>,
                { error: AppError }
              >;
              return (
                <Show when={prepared.corrections.length > 0}>
                  <Section title="Corrección propuesta de los tipos del BCE">
                    <p class="card-note">
                      {countOf(prepared.corrections.length, "línea tiene", "líneas tienen")} un tipo
                      del BCE de otro día que el de su fecha fiscal, lo que deja un cambio de la
                      regla de la fecha fiscal (criterio 25). Las cifras siguen usando el tipo de
                      tus datos. La corrección anula cada línea y la registra de nuevo con el tipo
                      oficial, todas de una vez.
                    </p>
                    <ul class="sentences">
                      <For each={prepared.corrections}>
                        {(line) => (
                          <li>
                            {inSentence(reference()(line.event_id))}: {formatExact(line.rate)}{" "}
                            {line.currency} del {formatDate(line.rate_date)} →{" "}
                            {formatExact(line.official.rate)} del {formatDate(line.official.date)}{" "}
                            (fecha fiscal {formatDate(line.fiscal_date)}).
                          </li>
                        )}
                      </For>
                    </ul>
                    <ClosedYearNotice impacts={closed} />
                    <div class="button-row">
                      <button type="button" onClick={() => setAsking(true)}>
                        Escribir la corrección
                      </button>
                    </div>
                  </Section>
                </Show>
              );
            })()}
          </Show>
        )}
      </Show>
      <ConfirmDialog
        open={asking()}
        title="¿Escribir la corrección entera?"
        confirm="Escribir la corrección"
        onClose={() => setAsking(false)}
        onConfirm={() => void write()}
      >
        Se anulan y se registran de nuevo todas las líneas de la propuesta en una sola escritura: o
        se escriben todas o ninguna.
      </ConfirmDialog>
    </>
  );
};
