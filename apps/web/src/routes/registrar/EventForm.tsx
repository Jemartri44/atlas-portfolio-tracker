// The generic form: it paints an `EventFormSpec` and walks the flow the CLI
// wizards use — fill in, **see the effect**, confirm, write (FR-043, FR-044).
//
// It checks only that the required fields are filled and that a number can be
// read (`inputErrors`); the rest is the domain's, inside the preview. A refusal
// about one field goes under it; the rest, next to the button (`FormActions`).
// On a phone the effect replaces the form, with a way back; from 1024px it sits
// beside it, and touching the form takes it away (docs/design/system.md §7.4).

import type { EventPreview, LedgerEvent, LedgerState } from "@atlas/domain";
import type { ClosedYearImpact } from "@atlas/domain/fiscal";
import { useNavigate } from "@solidjs/router";
import { createSignal, type JSX, Show } from "solid-js";
import { nameIndex } from "../../format/names.js";
import { today } from "../../ledger/state.js";
import { GRID, mediaQuery } from "../../shell/media.js";
import type { EventFormSpec, FormValues } from "../../view-models/forms/index.js";
import {
  errorsAfterEdit,
  initialValues,
  missingRequired,
  missingSentence,
  toDraft,
} from "../../view-models/forms/index.js";
import { isBucketAccount } from "../../view-models/options.js";
import { DuplicateDialog } from "./DuplicateDialog.jsx";
import { Effect } from "./Effect.jsx";
import { FormActions } from "./FormActions.jsx";
import { FormFields } from "./FormFields.jsx";
import { CorrectionReason, dependentsSentence, Reloaded, ThesisFirst } from "./FormNotices.jsx";
import { useFormProblems } from "./form-problems.js";
import { previewStep } from "./preview-step.js";
import { RateHint } from "./RateNotes.jsx";
import { useFormRates } from "./rates.js";
import { draftStep, writeStep } from "./write-step.js";

interface EventFormProps {
  spec: EventFormSpec;
  state: LedgerState;
  /** The ledger's events, for the lists that need them (an asset merged away). */
  events?: readonly LedgerEvent[];
  /** Correcting an existing event instead of recording a new one. */
  correcting?: { id: string; values: FormValues };
  /** Recording a draft (block 5): its values, the rate left for the history to propose. */
  fromDraft?: { id: string; values: FormValues } | undefined;
}

type Step = "form" | "preview";

export const EventForm = (props: EventFormProps): JSX.Element => {
  const navigate = useNavigate();
  const wide = mediaQuery(GRID);
  const [values, setValues] = createSignal<FormValues>(
    props.correcting?.values ?? props.fromDraft?.values ?? initialValues(props.spec, today()),
  );
  const [step, setStep] = createSignal<Step>("form");
  // What the user typed, by field: in the draft and not in the fields, which a
  // phone takes off the screen while it shows the effect.
  const [typed, setTyped] = createSignal<ReadonlySet<string>>(new Set());
  const revealed = (name: string): boolean => props.correcting === undefined || typed().has(name);
  const [preview, setPreview] = createSignal<EventPreview | undefined>(undefined);
  const [closedYears, setClosedYears] = createSignal<readonly ClosedYearImpact[]>([]);
  const { fieldErrors, setFieldErrors, problem, setProblem, failure, setFailure, readable, place } =
    useFormProblems(props.spec.fields);
  const [reason, setReason] = createSignal("");
  const [duplicate, setDuplicate] = createSignal<readonly string[] | undefined>(undefined);
  const [conflict, setConflict] = createSignal(false);
  const rates = useFormRates({
    spec: props.spec,
    state: props.state,
    values,
    setValues,
    typed,
    correcting: props.correcting !== undefined,
  });

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

  const onPreview = async (): Promise<void> => {
    if (!readable(values())) {
      return;
    }
    rates.check(values());
    try {
      const step = await previewStep(
        toDraft(props.spec, values(), props.state),
        props.correcting,
        reason().trim(),
      );
      setPreview(step.preview);
      setClosedYears(step.closedYears);
      setStep("preview");
      if (!wide()) {
        window.scrollTo?.({ top: 0 });
      }
    } catch (refusal) {
      place(refusal, values());
    }
  };

  /** Keeps it as a draft, without a rate: the ECB has not published it yet (block 5). */
  const onDraft = async (): Promise<void> => {
    if (!readable(values())) {
      return;
    }
    try {
      navigate(await draftStep(toDraft(props.spec, values(), props.state), rates.web()));
    } catch (refusal) {
      place(refusal, values());
    }
  };

  const onConfirm = async (confirmDuplicate = false): Promise<void> => {
    setProblem(undefined);
    setFailure(undefined);
    setDuplicate(undefined);
    if (!rates.cleared()) {
      return;
    }
    const result = await writeStep(
      toDraft(props.spec, values(), props.state),
      props,
      reason().trim(),
      confirmDuplicate,
    );
    if (result.ok) {
      navigate(result.value);
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
      setProblem(dependentsSentence(result.failure.affected.length));
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
            <RateHint
              rates={rates}
              currency={values().currency ?? ""}
              onDraft={
                props.correcting === undefined && props.fromDraft === undefined
                  ? () => void onDraft()
                  : undefined
              }
            />

            <Show when={props.correcting !== undefined}>
              <CorrectionReason value={reason()} onInput={setReason} />
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
          rates={rates}
          closedYears={closedYears()}
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
