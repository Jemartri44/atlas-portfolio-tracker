// The generic form: it paints an `EventFormSpec` and walks the flow the CLI
// wizards use — fill in, **see the effect**, confirm, write (FR-043, FR-044).
//
// It validates two things on its own: that the required fields are filled, and
// that a number can be read (`inputErrors`: "1.5" is refused as ambiguous, with
// a sentence). Everything else is the domain's: the shape is checked by
// `validateShape` and the invariants by the projection, both inside
// `previewEvent`. A refusal about one field is written **under that field**; the
// rest, next to the button (`FormActions`).
//
// On a phone the effect replaces the form, with a way back. From 1024px it
// appears beside the form, which stays in sight (docs/design/system.md §7.4);
// touching the form again takes the effect away, because it would no longer be
// the effect of what is written there.

import type { EventPreview, LedgerState } from "@atlas/domain";
import { useNavigate } from "@solidjs/router";
import { createSignal, type JSX, Show } from "solid-js";
import { Field } from "../../components/index.js";
import { nameIndex } from "../../format/names.js";
import { countOf } from "../../format/number.js";
import { toAppError } from "../../ledger/errors.js";
import type { AppError } from "../../ledger/state.js";
import { today } from "../../ledger/state.js";
import { correct, previewDraft, recordDraft } from "../../ledger/write.js";
import { GRID, mediaQuery } from "../../shell/media.js";
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
import { Effect } from "./Effect.jsx";
import { FormActions, revealField } from "./FormActions.jsx";
import { FormFields } from "./FormFields.jsx";
import { PriorYear, Reloaded, ThesisFirst } from "./FormNotices.jsx";

interface EventFormProps {
  spec: EventFormSpec;
  state: LedgerState;
  /** Correcting an existing event instead of recording a new one. */
  correcting?: { id: string; values: FormValues };
}

type Step = "form" | "preview";

export const EventForm = (props: EventFormProps): JSX.Element => {
  const navigate = useNavigate();
  const wide = mediaQuery(GRID);
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
    // The effect beside the form is the effect of what was there before.
    if (step() === "preview") {
      setStep("form");
      setPreview(undefined);
    }
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
      if (!wide()) {
        window.scrollTo?.({ top: 0 });
      }
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
        <Reloaded />
      </Show>

      <Show when={priorYear()}>
        <PriorYear />
      </Show>

      <div class="register">
        <Show when={step() === "form" || wide()}>
          <form class="form" onSubmit={(event) => event.preventDefault()}>
            <Show when={bucketWithoutThesis()}>
              <ThesisFirst />
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
                hint="Se anula el original y se registra el corregido; el motivo queda registrado."
                value={reason()}
                onInput={setReason}
                class="full"
              />
            </Show>

            <FormActions
              problem={step() === "form" ? problem() : undefined}
              failure={step() === "form" ? failure() : undefined}
              blocked={blocked()}
            >
              <button
                type="button"
                class={step() === "preview" ? "secondary" : undefined}
                disabled={blocked() !== undefined}
                onClick={() => void onPreview()}
              >
                Ver el efecto
              </button>
            </FormActions>
          </form>
        </Show>

        <Effect
          preview={step() === "preview" ? preview() : undefined}
          names={nameIndex(props.state)}
          wide={wide()}
          problem={problem()}
          failure={failure()}
          confirmLabel={props.correcting === undefined ? "Registrar" : "Rectificar"}
          onBack={() => setStep("form")}
          onConfirm={() => void onConfirm()}
        />
      </div>

      <DuplicateDialog
        duplicates={duplicate()}
        onCancel={() => setDuplicate(undefined)}
        onConfirm={() => void onConfirm(true)}
      />
    </>
  );
};
