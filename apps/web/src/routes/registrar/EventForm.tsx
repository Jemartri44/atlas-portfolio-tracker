// The generic form: it paints an `EventFormSpec` and walks the flow the CLI
// wizards use — fill in, **see the effect**, confirm, write (FR-043, FR-044).
//
// It validates two things on its own: that the required fields are filled, and
// that a number can be read (`inputErrors`: "1.5" is refused as ambiguous, with
// a sentence). Everything else is the domain's: the shape is checked by
// `validateShape` and the invariants by the projection, both inside
// `previewEvent`. A refusal about one field is written **under that field**; the
// rest, next to the button (`FormActions`).

import type { EventPreview, LedgerState } from "@atlas/domain";
import { A, useNavigate } from "@solidjs/router";
import { createSignal, type JSX, Show } from "solid-js";
import { Field, Notice } from "../../components/index.js";
import { nameIndex } from "../../format/names.js";
import { countOf } from "../../format/number.js";
import { toAppError } from "../../ledger/errors.js";
import type { AppError } from "../../ledger/state.js";
import { store, today } from "../../ledger/state.js";
import { correct, previewDraft, recordDraft } from "../../ledger/write.js";
import type { EventFormSpec, FormValues } from "../../view-models/forms/index.js";
import {
  errorsAfterEdit,
  fieldErrorOf,
  initialValues,
  inputErrors,
  missingRequired,
  missingSentence,
  toDraft,
} from "../../view-models/forms/index.js";
import { isBucketAccount } from "../../view-models/options.js";
import { DuplicateDialog } from "./DuplicateDialog.jsx";
import { FormActions, revealField } from "./FormActions.jsx";
import { FormFields } from "./FormFields.jsx";
import { Preview } from "./Preview.jsx";

interface EventFormProps {
  spec: EventFormSpec;
  state: LedgerState;
  /** Correcting an existing event instead of recording a new one. */
  correcting?: { id: string; values: FormValues };
}

type Step = "form" | "preview";

export const EventForm = (props: EventFormProps): JSX.Element => {
  const navigate = useNavigate();
  const [values, setValues] = createSignal<FormValues>(
    props.correcting?.values ?? initialValues(props.spec, today()),
  );
  const [step, setStep] = createSignal<Step>("form");
  const [preview, setPreview] = createSignal<EventPreview | undefined>(undefined);
  // A refusal about one field goes under it; the rest, next to the button.
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string>>({});
  const [problem, setProblem] = createSignal<string | undefined>(undefined);
  // The whole error of a write, with the button that fixes it (inventory V6).
  const [failure, setFailure] = createSignal<AppError | undefined>(undefined);
  const [reason, setReason] = createSignal("");
  const [duplicate, setDuplicate] = createSignal<readonly string[] | undefined>(undefined);
  const [conflict, setConflict] = createSignal(false);
  const [priorYear, setPriorYear] = createSignal(false);

  /** Why "Ver el efecto" cannot be pressed yet, said next to it. */
  const blocked = (): string | undefined =>
    missingSentence(props.spec.fields, missingRequired(props.spec, values())) ??
    (props.correcting !== undefined && reason().trim() === ""
      ? "Para ver el efecto falta el motivo de la rectificación."
      : undefined);

  const bucketWithoutThesis = (): boolean =>
    props.spec.type === "buy" &&
    isBucketAccount(props.state, values().account_id) &&
    (values().thesis_id ?? "") === "";

  /** Editing a field clears what was said about it. */
  const onChange = (next: FormValues): void => {
    setFieldErrors(errorsAfterEdit(fieldErrors(), values(), next));
    setValues(next);
  };

  const showFieldErrors = (errors: Record<string, string>): void => {
    setFieldErrors(errors);
    const first = props.spec.fields.find((field) => errors[field.name] !== undefined);
    if (first !== undefined) {
      revealField(`f-${first.name}`);
    }
  };

  const onPreview = async (): Promise<void> => {
    setProblem(undefined);
    setFailure(undefined);
    const unreadable = inputErrors(props.spec.fields, values());
    if (Object.keys(unreadable).length > 0) {
      showFieldErrors(unreadable);
      return;
    }
    setFieldErrors({});
    try {
      setPreview(await previewDraft(toDraft(props.spec, values())));
      setStep("preview");
      window.scrollTo?.({ top: 0 });
    } catch (refusal) {
      const onField = fieldErrorOf(refusal, props.spec.fields, values());
      if (onField === undefined) {
        setProblem(toAppError(refusal).message);
      } else {
        showFieldErrors({ [onField.field]: onField.message });
      }
    }
  };

  const onConfirm = async (confirmDuplicate = false): Promise<void> => {
    setProblem(undefined);
    setFailure(undefined);
    setDuplicate(undefined);
    const draft = toDraft(props.spec, values());
    const result =
      props.correcting === undefined
        ? await recordDraft(draft, { confirmDuplicate })
        : await correct(props.correcting.id, draft, reason().trim(), { confirmDuplicate });
    if (result.ok) {
      const id = "event" in result.value ? result.value.event.id : "";
      if ("priorYear" in result.value && result.value.priorYear) {
        setPriorYear(true);
        return;
      }
      navigate(id === "" ? "/movimientos" : `/movimientos/${id}`);
      return;
    }
    if (result.failure.kind === "duplicate") {
      setDuplicate(result.failure.existing);
      return;
    }
    if (result.failure.kind === "conflict") {
      setConflict(true);
      setStep("form");
      return;
    }
    if (result.failure.kind === "dependents") {
      setProblem(
        `${countOf(result.failure.affected.length, "movimiento posterior depende", "movimientos posteriores dependen")} de este: rectifícalos antes.`,
      );
      return;
    }
    setFailure(result.failure.error);
  };

  return (
    <>
      <Show when={conflict()}>
        <Notice severity="caution" title="El libro ha cambiado">
          Otra pestaña o la CLI han escrito mientras rellenabas. Se ha recargado el libro: vuelve a
          ver el efecto antes de confirmar. No se ha pisado nada.
        </Notice>
      </Show>

      <Show when={priorYear()}>
        <Notice
          severity="caution"
          title="Ejercicio anterior"
          action={
            <A href="/movimientos" role="button">
              Ver el libro
            </A>
          }
        >
          Registrado. El evento rectificado pertenece a un ejercicio anterior: puede afectar a una
          declaración ya presentada.
        </Notice>
      </Show>

      <Show
        when={step() === "form"}
        fallback={
          <div class="stack">
            <Preview preview={preview() as EventPreview} names={nameIndex(props.state)} />
            <FormActions problem={problem()} failure={failure()}>
              <button type="button" class="secondary" onClick={() => setStep("form")}>
                Volver a los datos
              </button>
              <button type="button" disabled={store.writing()} onClick={() => void onConfirm()}>
                {props.correcting === undefined ? "Registrar" : "Rectificar"}
              </button>
            </FormActions>
          </div>
        }
      >
        <form class="form" onSubmit={(event) => event.preventDefault()}>
          <Show when={bucketWithoutThesis()}>
            <Notice
              severity="caution"
              title="Las compras del cubo exigen una tesis"
              action={
                <A href="/registrar/tesis" role="button">
                  Abrir una tesis
                </A>
              }
            >
              La regla 15 pide escribir la tesis <strong>antes</strong> de comprar: la hipótesis, el
              plazo, la condición de invalidación y el tamaño previsto. Si no hay ninguna abierta
              para esta cuenta y este activo, créala ahora y vuelve.
            </Notice>
          </Show>

          <FormFields
            fields={props.spec.fields}
            values={values()}
            state={props.state}
            onChange={onChange}
            errors={fieldErrors()}
          />

          <Show when={props.correcting !== undefined}>
            <Field
              id="correct-reason"
              kind="text"
              label="Motivo de la rectificación"
              required
              hint="Se anula el original y se registra el corregido; el motivo queda en el libro."
              value={reason()}
              onInput={setReason}
              class="full"
            />
          </Show>

          <FormActions problem={problem()} failure={failure()} blocked={blocked()}>
            <button
              type="button"
              disabled={blocked() !== undefined}
              onClick={() => void onPreview()}
            >
              Ver el efecto
            </button>
          </FormActions>
        </form>
      </Show>

      <DuplicateDialog
        duplicates={duplicate()}
        onCancel={() => setDuplicate(undefined)}
        onConfirm={() => void onConfirm(true)}
      />
    </>
  );
};
