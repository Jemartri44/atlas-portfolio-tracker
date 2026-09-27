// One kind of corporate action. **The web composes nothing**: it hands the
// parameters to `corporateActionDraft` and shows what comes back, fractions
// included. Problems are said under their field or next to the buttons.

import type { EventPreview, LedgerState } from "@atlas/domain";
import { accounts } from "@atlas/domain";
import type { ClosedYearImpact } from "@atlas/domain/fiscal";
import { corporateActionDraft } from "@atlas/domain/tools";
import { useNavigate, useParams } from "@solidjs/router";
import { createMemo, createSignal, type JSX, Show } from "solid-js";
import { ClosedYearNotice, Notice, Tag } from "../../../components/index.js";
import { nameIndex } from "../../../format/names.js";
import { toAppError } from "../../../ledger/errors.js";
import { attempt } from "../../../ledger/query.js";
import { store, today } from "../../../ledger/state.js";
import { closedYearsOfDraft, previewDraft, recordDraft } from "../../../ledger/write.js";
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
import { NoForm, Reloaded } from "../FormNotices.jsx";
import { Preview } from "../Preview.jsx";
import { createWarned } from "../warned.js";
import { Fractions } from "./Fractions.jsx";
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
        const warned = createWarned();
        const [conflict, setConflict] = createSignal(false);
        /** The filed returns it reaches, said before «Registrar» (ADR-0020; P11 of 015). */
        const [closed, setClosed] = createSignal<readonly ClosedYearImpact[]>([]);
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
            const [shown, reached] = await Promise.all([
              previewDraft(built.draft as never),
              closedYearsOfDraft(built.draft as never),
            ]);
            setClosed(reached);
            setPreview(shown);
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
          const result = await recordDraft(built.draft as never, {
            confirmDuplicate: warned.confirms(built.draft, confirmDuplicate),
          });
          if (result.ok) {
            navigate(`/movimientos/${result.value.event.id}`);
            return;
          }
          if (result.failure.kind === "duplicate") {
            warned.remember(built.draft);
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
              <NoForm
                title="Evento corporativo"
                what="No hay ningún formulario para ese tipo de evento corporativo."
              />
            }
          >
            {(current) => (
              <>
                <PageHeader title={current().title} lead={current().when} />

                <Notice severity="info" title="Qué va a pasar">
                  {current().effect}
                </Notice>

                <Show when={conflict()}>
                  <Reloaded />
                </Show>

                <div class="register">
                  <form class="form" onSubmit={(event) => event.preventDefault()}>
                    <FormFields
                      fields={fields()}
                      values={values()}
                      state={snapshot.state}
                      onChange={setValues}
                      prefix="ca"
                      errors={errors()}
                    />

                    <Fractions
                      none={draft()?.no_fractions === true}
                      fractional={draft()?.fractional ?? []}
                      names={names}
                    />

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
                      <section class="effect" aria-label="El efecto">
                        <Preview preview={shown()} names={names} />
                        <ClosedYearNotice impacts={closed()} />
                        <Notice severity="info" title="Guarda el documento">
                          Copia la nota del emisor a tu carpeta de documentos: tus datos guardan la
                          referencia, no el archivo.
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
                      </section>
                    )}
                  </Show>
                </div>

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
