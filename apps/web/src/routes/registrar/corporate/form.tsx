// One kind of corporate action. **The web composes nothing**: it hands the
// parameters to `corporateActionDraft` and shows what comes back, fractions
// included. Problems are said under their field or next to the buttons.

import type { EventPreview, LedgerState } from "@atlas/domain";
import { accounts, corporateActionDraft, Quantity } from "@atlas/domain";
import { A, useNavigate, useParams } from "@solidjs/router";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { Amount, EmptyState, Notice, Tag } from "../../../components/index.js";
import { displayName, nameIndex } from "../../../format/names.js";
import { toAppError } from "../../../ledger/errors.js";
import { attempt } from "../../../ledger/query.js";
import { store, today } from "../../../ledger/state.js";
import { previewDraft, recordDraft } from "../../../ledger/write.js";
import { PageHeader } from "../../../shell/PageHeader.jsx";
import { CORPORATE_COMMON, corporateForm } from "../../../view-models/forms/corporate.js";
import type { FieldSpec, FormValues } from "../../../view-models/forms/index.js";
import {
  initialValues,
  inputErrors,
  missingRequired,
  missingSentence,
} from "../../../view-models/forms/index.js";
import { RequireLedger } from "../../guard.jsx";
import { DuplicateDialog } from "../DuplicateDialog.jsx";
import { FormActions } from "../FormActions.jsx";
import { FormFields } from "../FormFields.jsx";
import { Preview } from "../Preview.jsx";
import { feeLinesError, toCorporateParams } from "./params.js";

export default function CorporateFormRoute(): JSX.Element {
  const params = useParams<{ kind: string }>();
  const navigate = useNavigate();

  return (
    <RequireLedger writes skeleton={8}>
      {(snapshot) => {
        const form = () => corporateForm(params.kind);
        const fields = (): FieldSpec[] => [...CORPORATE_COMMON, ...(form()?.fields ?? [])];
        const [values, setValues] = createSignal<FormValues>(
          initialValues({ fields: fields() } as never, today()),
        );
        const [preview, setPreview] = createSignal<EventPreview | undefined>(undefined);
        const [problem, setProblem] = createSignal<string | undefined>(undefined);
        const [duplicate, setDuplicate] = createSignal<readonly string[] | undefined>(undefined);
        const [conflict, setConflict] = createSignal(false);
        const names = nameIndex(snapshot.state);
        const catalogue = accounts(snapshot.state);

        /** What the form can tell on its own: unreadable numbers and fee lines, by field. */
        const errors = createMemo((): Record<string, string> => {
          const fees = feeLinesError(values(), catalogue);
          return {
            ...inputErrors(fields(), values()),
            ...(fees === undefined ? {} : { cash_fees: fees }),
          };
        });
        const missing = () => missingRequired({ fields: fields() } as never, values());

        const composed = createMemo(() => {
          const current = form();
          if (current === undefined || missing().length > 0 || Object.keys(errors()).length > 0) {
            return undefined;
          }
          return attempt(() =>
            corporateActionDraft(
              snapshot.state as LedgerState,
              snapshot.events,
              toCorporateParams(current, values(), catalogue),
            ),
          );
        });

        const draft = () => {
          const outcome = composed();
          return outcome?.ok === true ? outcome.value : undefined;
        };

        /** Why "Ver el efecto" is disabled, said next to it. */
        const blocked = (): string | undefined => {
          const outcome = composed();
          return (
            missingSentence(fields(), missing()) ??
            (Object.keys(errors()).length > 0
              ? "Corrige los datos marcados en rojo."
              : undefined) ??
            (outcome?.ok === false ? outcome.error.message : undefined)
          );
        };

        const onPreview = async (): Promise<void> => {
          setProblem(undefined);
          const built = draft();
          if (built === undefined) {
            return;
          }
          try {
            setPreview(await previewDraft(built.draft as never));
          } catch (failure) {
            setProblem(toAppError(failure).message);
          }
        };

        const onConfirm = async (confirmDuplicate = false): Promise<void> => {
          const built = draft();
          if (built === undefined) {
            return;
          }
          setProblem(undefined);
          setDuplicate(undefined);
          const result = await recordDraft(built.draft as never, { confirmDuplicate });
          if (result.ok) {
            navigate(`/movimientos/${result.value.event.id}`);
            return;
          }
          if (result.failure.kind === "duplicate") {
            setDuplicate(result.failure.existing);
            return;
          }
          if (result.failure.kind === "conflict") {
            setConflict(true);
            setPreview(undefined);
            return;
          }
          if (result.failure.kind === "error") {
            setProblem(result.failure.error.message);
          }
        };

        return (
          <Show
            when={form()}
            fallback={
              <>
                <PageHeader title="Evento corporativo" />
                <EmptyState what="No hay ningún formulario para ese tipo de evento corporativo.">
                  <A href="/registrar">Ver qué se puede registrar</A>
                </EmptyState>
              </>
            }
          >
            {(current) => (
              <>
                <PageHeader title={current().title} lead={current().when} />

                <Notice severity="info" title="Qué va a pasar">
                  {current().effect}
                </Notice>

                <Show when={conflict()}>
                  <Notice severity="caution" title="El libro ha cambiado">
                    Otra pestaña o la CLI han escrito mientras rellenabas. Vuelve a ver el efecto
                    antes de confirmar. No se ha pisado nada.
                  </Notice>
                </Show>

                <form class="form" onSubmit={(event) => event.preventDefault()}>
                  <FormFields
                    fields={fields()}
                    values={values()}
                    state={snapshot.state}
                    onChange={setValues}
                    prefix="ca"
                    errors={errors()}
                  />

                  <Show when={draft()?.no_fractions === true}>
                    <Notice severity="info" title="Sin picos">
                      Ninguna cuenta queda con fracciones, así que no se genera ninguna venta
                      forzosa.
                    </Notice>
                  </Show>

                  <Show when={(draft()?.fractional.length ?? 0) > 0}>
                    <Notice severity="caution" title="Picos que se venden">
                      <For each={draft()?.fractional ?? []}>
                        {(row) => (
                          <p class="tiny flush">
                            {displayName(names, row.account_id)}:{" "}
                            <Amount quantity={Quantity.parse(row.quantity)} />
                          </p>
                        )}
                      </For>
                      Esa venta genera ganancia patrimonial. La aplicación la calcula al registrar
                      el evento.
                    </Notice>
                  </Show>

                  <FormActions
                    problem={preview() === undefined ? problem() : undefined}
                    blocked={blocked()}
                  >
                    <button
                      type="button"
                      disabled={draft() === undefined}
                      onClick={() => void onPreview()}
                    >
                      Ver el efecto
                    </button>
                  </FormActions>
                </form>

                <Show when={preview()}>
                  {(shown) => (
                    <div class="stack">
                      <Preview preview={shown()} names={names} />
                      <Notice severity="info" title="Guarda el documento">
                        Copia la nota del emisor a tu carpeta de documentos: el libro guarda la
                        referencia, no el fichero.
                      </Notice>
                      <FormActions problem={problem()}>
                        <button
                          type="button"
                          class="secondary"
                          onClick={() => setPreview(undefined)}
                        >
                          Volver a los datos
                        </button>
                        <button
                          type="button"
                          disabled={store.writing()}
                          onClick={() => void onConfirm()}
                        >
                          Registrar
                        </button>
                      </FormActions>
                    </div>
                  )}
                </Show>

                <DuplicateDialog
                  duplicates={duplicate()}
                  onCancel={() => setDuplicate(undefined)}
                  onConfirm={() => void onConfirm(true)}
                >
                  <p>
                    <Tag tone="caution">ojo</Tag> Un evento corporativo repetido transforma los
                    lotes dos veces: comprueba que no es el mismo antes de insistir.
                  </p>
                </DuplicateDialog>
              </>
            )}
          </Show>
        );
      }}
    </RequireLedger>
  );
}
