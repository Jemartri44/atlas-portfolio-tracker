// The form of one kind of corporate action.
//
// **The web composes nothing.** It collects the parameters, hands them to
// `corporateActionDraft` and shows what comes back — including which accounts
// are left with fractions, which is a figure with a fiscal consequence and
// therefore not one an interface gets to work out.

import type { EventPreview, LedgerState } from "@atlas/domain";
import { corporateActionDraft } from "@atlas/domain";
import { A, useNavigate, useParams } from "@solidjs/router";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { Badge, Callout, EmptyState, ErrorView } from "../../../components/index.js";
import { nameIndex } from "../../../format/names.js";
import { toAppError } from "../../../ledger/actions.js";
import { attempt } from "../../../ledger/query.js";
import { store, today } from "../../../ledger/state.js";
import { previewDraft, recordDraft } from "../../../ledger/write.js";
import { PageHeader } from "../../../shell/PageHeader.jsx";
import { CORPORATE_COMMON, corporateForm } from "../../../view-models/forms/corporate.js";
import type { FieldSpec, FormValues } from "../../../view-models/forms/index.js";
import { missingRequired } from "../../../view-models/forms/index.js";
import { RequireLedger } from "../../guard.jsx";
import { DuplicateDialog } from "../DuplicateDialog.jsx";
import { FormFields } from "../FormFields.jsx";
import { Preview } from "../Preview.jsx";
import { toCorporateParams } from "./params.js";

const initial = (fields: readonly FieldSpec[], date: string): FormValues => {
  const values: FormValues = {};
  for (const field of fields) {
    values[field.name] = field.initial ?? (field.kind === "date" ? date : "");
  }
  return values;
};

export default function CorporateFormRoute(): JSX.Element {
  const params = useParams<{ kind: string }>();
  const navigate = useNavigate();

  return (
    <RequireLedger writes skeleton={8}>
      {(snapshot) => {
        const form = () => corporateForm(params.kind);
        const fields = (): FieldSpec[] => [...CORPORATE_COMMON, ...(form()?.fields ?? [])];
        const [values, setValues] = createSignal<FormValues>(initial(fields(), today()));
        const [preview, setPreview] = createSignal<EventPreview | undefined>(undefined);
        const [error, setError] = createSignal<string | undefined>(undefined);
        const [duplicate, setDuplicate] = createSignal<readonly string[] | undefined>(undefined);
        const [conflict, setConflict] = createSignal(false);

        const composed = createMemo(() => {
          const current = form();
          if (
            current === undefined ||
            missingRequired({ fields: fields() } as never, values()).length > 0
          ) {
            return undefined;
          }
          return attempt(() =>
            corporateActionDraft(
              snapshot.state as LedgerState,
              snapshot.events,
              toCorporateParams(current, values()),
            ),
          );
        });

        const draft = () => {
          const outcome = composed();
          return outcome?.ok === true ? outcome.value : undefined;
        };
        const composeError = () => {
          const outcome = composed();
          return outcome?.ok === false ? outcome.error : undefined;
        };

        const onPreview = async (): Promise<void> => {
          setError(undefined);
          const built = draft();
          if (built === undefined) {
            return;
          }
          try {
            setPreview(await previewDraft(built.draft as never));
          } catch (failure) {
            setError(toAppError(failure).message);
          }
        };

        const onConfirm = async (confirmDuplicate = false): Promise<void> => {
          const built = draft();
          if (built === undefined) {
            return;
          }
          setError(undefined);
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
            setError(result.failure.error.message);
          }
        };

        return (
          <Show
            when={form()}
            fallback={
              <>
                <PageHeader title="Evento corporativo" />
                <EmptyState what={`No hay ningún formulario para "${params.kind}".`}>
                  <A href="/registrar">Ver qué se puede registrar</A>
                </EmptyState>
              </>
            }
          >
            {(current) => (
              <>
                <PageHeader title={current().title} lead={current().when} />

                <Callout tone="info" title="Qué va a hacer el dominio">
                  {current().effect}
                </Callout>

                <Show when={conflict()}>
                  <Callout tone="warning" title="El libro ha cambiado">
                    Otra pestaña o la CLI han escrito mientras rellenabas. Vuelve a ver el efecto
                    antes de confirmar. No se ha pisado nada.
                  </Callout>
                </Show>

                <Show when={error() !== undefined}>
                  <Callout tone="error" title="El dominio rechaza este evento">
                    {error()}
                  </Callout>
                </Show>

                <Show when={composeError()}>
                  {(failure) => (
                    <ErrorView error={failure()} title="Faltan datos para componer el evento" />
                  )}
                </Show>

                <form class="form" onSubmit={(event) => event.preventDefault()}>
                  <FormFields
                    fields={fields()}
                    values={values()}
                    state={snapshot.state}
                    onChange={setValues}
                    prefix="ca"
                  />

                  <Show when={draft()?.no_fractions === true}>
                    <Callout tone="info" title="Sin picos">
                      Ninguna cuenta queda con fracciones, así que no se genera ninguna venta
                      forzosa.
                    </Callout>
                  </Show>

                  <Show when={(draft()?.fractional.length ?? 0) > 0}>
                    <Callout tone="warning" title="Picos que se venden">
                      <For each={draft()?.fractional ?? []}>
                        {(row) => (
                          <p class="tiny flush">
                            {row.account_id}: {row.quantity}
                          </p>
                        )}
                      </For>
                      Esa venta genera ganancia patrimonial. La calcula el dominio, no esta
                      pantalla.
                    </Callout>
                  </Show>

                  <div class="actions-bar">
                    <button
                      type="button"
                      disabled={draft() === undefined}
                      onClick={() => void onPreview()}
                    >
                      Ver el efecto
                    </button>
                  </div>
                </form>

                <Show when={preview()}>
                  {(shown) => (
                    <div class="stack">
                      <Preview preview={shown()} names={nameIndex(snapshot.state)} />
                      <Callout tone="info" title="Guarda el documento">
                        Copia la nota del emisor a tu carpeta de documentos: el libro guarda la
                        referencia, no el fichero.
                      </Callout>
                      <div class="actions-bar">
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
                      </div>
                    </div>
                  )}
                </Show>

                <DuplicateDialog
                  duplicates={duplicate()}
                  onCancel={() => setDuplicate(undefined)}
                  onConfirm={() => void onConfirm(true)}
                >
                  <p>
                    <Badge tone="warning">ojo</Badge> Un evento corporativo repetido transforma los
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
