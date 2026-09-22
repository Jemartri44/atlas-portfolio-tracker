// The generic form: it paints an `EventFormSpec` and walks the flow the CLI
// wizards use — fill in, **see the effect**, confirm, write (FR-043, FR-044).
//
// It checks only that the required fields are filled and that a number can be
// read (`inputErrors`); the rest is the domain's, inside the preview. A refusal
// about one field goes under it; the rest, next to the button (`FormActions`).
// On a phone the effect replaces the form, with a way back; from 1024px it sits
// beside it, and touching the form takes it away (docs/design/system.md §7.4).

import type { EventPreview, LedgerEvent, LedgerState } from "@atlas/domain";
import { useNavigate } from "@solidjs/router";
import { createSignal, type JSX, Show } from "solid-js";
import { Field } from "../../components/index.js";
import { nameIndex } from "../../format/names.js";
import { countOf } from "../../format/number.js";
import { toAppError } from "../../ledger/errors.js";
import type { AppError } from "../../ledger/state.js";
import { today } from "../../ledger/state.js";
import { correct, previewCorrectionDraft, previewDraft, recordDraft } from "../../ledger/write.js";
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
import { doneUrl } from "../movimientos/Rectified.jsx";
import { DuplicateDialog } from "./DuplicateDialog.jsx";
import { Effect } from "./Effect.jsx";
import { FormActions, revealField } from "./FormActions.jsx";
import { FormFields } from "./FormFields.jsx";
import { Reloaded, ThesisFirst } from "./FormNotices.jsx";

interface EventFormProps {
  spec: EventFormSpec;
  state: LedgerState;
  /** The ledger's events, for the lists that need them (an asset merged away). */
  events?: readonly LedgerEvent[];
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
  // What the user typed, by field: in the draft and not in the fields, which a
  // phone takes off the screen while it shows the effect.
  const [typed, setTyped] = createSignal<ReadonlySet<string>>(new Set());
  const revealed = (name: string): boolean => props.correcting === undefined || typed().has(name);
  const [preview, setPreview] = createSignal<EventPreview | undefined>(undefined);
  // A refusal about one field goes under it; the rest, next to the button.
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string>>({});
  const [problem, setProblem] = createSignal<string | undefined>(undefined);
  // The whole error of a write, with the button that fixes it (inventory V6).
  const [failure, setFailure] = createSignal<AppError | undefined>(undefined);
  const [reason, setReason] = createSignal("");
  const [duplicate, setDuplicate] = createSignal<readonly string[] | undefined>(undefined);
  const [conflict, setConflict] = createSignal(false);

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
      // A correction is previewed as it will be written: the original reversed
      // and the corrected event in its place, never the two added together.
      const draft = toDraft(props.spec, values());
      const correcting = props.correcting;
      setPreview(
        await (correcting === undefined
          ? previewDraft(draft)
          : previewCorrectionDraft(correcting.id, draft, reason().trim())),
      );
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
      // To the movement written, with what was done and, for a past tax year,
      // the warning: the reload that follows the write cannot take them away.
      const priorYear = "priorYear" in result.value && result.value.priorYear;
      const done = props.correcting === undefined ? "registrado" : "corregido";
      navigate(doneUrl(result.value.event.id, done, priorYear));
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
              events={props.events}
              onChange={onChange}
              errors={fieldErrors()}
              revealed={revealed}
              onTyped={(name) => setTyped(new Set([...typed(), name]))}
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
          revealed={revealed}
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
