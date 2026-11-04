// The generic form: it paints an `EventFormSpec` and walks the flow the CLI wizards use — fill in,
// **see the effect**, confirm, write.
//
// It checks only that the required fields are filled and that a number can be
// read (`inputErrors`); the rest is the domain's, inside the preview. A refusal
// about one field goes under it; the rest, next to the button (`FormActions`).
// On a phone the effect replaces the form, with a way back; from 1024px it sits
// beside it, and touching the form takes it away (docs/design/system.md §7.4).
//
// The write goes to the cloud (ADR-0035): a `412` rebuilds the effect of the
// **same form** over the ledger reloaded, and the person confirms again; a lost
// answer is the notice of the frame (`shell/PendingWrite.tsx`), not this form's.
//
// LINE BUDGET: this form is the one flow of the four ways to write (record, correct,
// confirm a draft, save a draft); what can leave it already has (`draft-save.ts`,
// `form-problems.ts`, `write-step.ts`).

import type { EventPreview, LedgerEvent, LedgerState } from "@atlas/domain";
import type { ClosedYearImpact } from "@atlas/domain/fiscal";
import { useNavigate } from "@solidjs/router";
import { createEffect, createSignal, type JSX, on, onCleanup, Show } from "solid-js";
import { nameIndex } from "../../format/names.js";
import { today } from "../../ledger/state.js";
import { GRID, mediaQuery } from "../../shell/media.js";
import { SessionNotice } from "../../shell/SessionNotice.jsx";
import type { EventFormSpec, FormValues } from "../../view-models/forms/index.js";
import {
  errorsAfterEdit,
  initialValues,
  missingRequired,
  missingSentence,
  toDraft,
} from "../../view-models/forms/index.js";
import { DuplicateDialog } from "./DuplicateDialog.jsx";
import { createDraftSaver } from "./draft-save.js";
import { Effect } from "./Effect.jsx";
import { FormActions } from "./FormActions.jsx";
import { FormFields } from "./FormFields.jsx";
import { CorrectionReason, dependentsSentence, Reloaded } from "./FormNotices.jsx";
import { useFormProblems } from "./form-problems.js";
import { withPrefill } from "./prefill.js";
import { previewStep } from "./preview-step.js";
import { RateHint } from "./RateNotes.jsx";
import { useFormRates } from "./rates.js";
import { createWarned } from "./warned.js";
import { writeStep } from "./write-step.js";

interface EventFormProps {
  spec: EventFormSpec;
  state: LedgerState;
  /** The ledger's events, for the lists that need them (an asset merged away). */
  events?: readonly LedgerEvent[];
  /** Correcting an existing event instead of recording a new one. */
  correcting?: { id: string; values: FormValues };
  /** Recording a draft: its values, the rate left for the history to propose. */
  fromDraft?: { id: string; values: FormValues } | undefined;
  /**
   * What the application proposes (the purchase of the month): an account, an asset, an amount.
   * Filled as if chosen, so the currency follows; the amount came from the user's data and is
   * masked until the field is edited (docs/design/system.md §5.10).
   */
  prefill?: FormValues | undefined;
}

type Step = "form" | "preview";

/** How long after the last keystroke the effect beside the form is asked again. */
const LIVE_DELAY_MS = 350;

export const EventForm = (props: EventFormProps): JSX.Element => {
  const navigate = useNavigate();
  const wide = mediaQuery(GRID);
  const [values, setValues] = createSignal<FormValues>(
    props.correcting?.values ??
      props.fromDraft?.values ??
      withPrefill(props.spec, props.state, initialValues(props.spec, today()), props.prefill ?? {}),
  );
  const [step, setStep] = createSignal<Step>("form");
  // What the user typed, by field: in the draft and not in the fields, which a
  // phone takes off the screen while it shows the effect.
  const [typed, setTyped] = createSignal<ReadonlySet<string>>(new Set());
  const proposed = new Set<string>(
    Object.keys(props.prefill ?? {}).filter((name) => name === "amount" || name === "quantity"),
  );
  const revealed = (name: string): boolean =>
    (props.correcting === undefined && !proposed.has(name)) || typed().has(name);
  const [preview, setPreview] = createSignal<EventPreview | undefined>(undefined);
  const [closedYears, setClosedYears] = createSignal<readonly ClosedYearImpact[]>([]);
  const problems = useFormProblems(props.spec.fields);
  const { fieldErrors, setFieldErrors, problem, setProblem, failure, setFailure, readable, place } =
    problems;
  const [reason, setReason] = createSignal("");
  const [duplicate, setDuplicate] = createSignal<readonly string[] | undefined>(undefined);
  const warned = createWarned();
  const [conflict, setConflict] = createSignal(false);
  const [signedOut, setSignedOut] = createSignal(false);
  const rates = useFormRates({
    spec: props.spec,
    state: () => props.state,
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

  /**
   * On a wide screen the effect sits beside the form and follows what is typed (direction A): a
   * moment after the last keystroke, with every required field filled, it is asked again, quietly —
   * a refusal does not mark the fields while the user is still typing; «Ver el efecto» says why.
   * Nothing is written until «Registrar». On a phone the effect stays a step of its own, before
   * the button that writes. Rectifying asks for a reason first, so it keeps the button.
   */
  // Every change takes a ticket; an answer is shown only if no change came after it.
  let pending: ReturnType<typeof setTimeout> | undefined;
  let edits = 0;
  const livePreview = (): void => {
    clearTimeout(pending);
    const ticket = ++edits;
    if (!wide() || props.correcting !== undefined || blocked() !== undefined) {
      return;
    }
    pending = setTimeout(() => {
      const asked = values();
      void (async () => {
        try {
          const live = await previewStep(toDraft(props.spec, asked, props.state), undefined, "");
          if (ticket === edits) {
            rates.check(asked);
            setPreview(live.preview);
            setClosedYears(live.closedYears);
            setStep("preview");
          }
        } catch {
          // Said when asked for: «Ver el efecto» places the refusal on its field.
        }
      })();
    }, LIVE_DELAY_MS);
  };
  // Any change of the values asks again: a key, and what the form fills on its own (the ECB rate).
  createEffect(on(values, livePreview, { defer: true }));
  onCleanup(() => {
    clearTimeout(pending);
    edits++;
  });

  /** Editing a field clears what was said about it. */
  const onChange = (next: FormValues): void => {
    setFieldErrors(errorsAfterEdit(fieldErrors(), values(), next));
    setValues(next);
    // Editing is the answer to «Tus datos han cambiado»: the notice has been read.
    setConflict(false);
    // The effect beside the form is the effect of what was there before.
    if (step() === "preview") {
      setStep("form");
      setPreview(undefined);
    }
  };

  const onPreview = async (): Promise<void> => {
    // Asked by hand: the effect that follows the keys, if still on its way, is not this one, and
    // would undo the yes given to a rate that is not the official one.
    clearTimeout(pending);
    edits++;
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

  const onDraft = createDraftSaver(
    props.spec,
    () => props.state,
    values,
    rates.web,
    problems,
    setSignedOut,
  );

  const onConfirm = async (confirmDuplicate = false): Promise<void> => {
    setProblem(undefined);
    setFailure(undefined);
    setDuplicate(undefined);
    setSignedOut(false);
    if (!rates.cleared()) {
      return;
    }
    let draft: ReturnType<typeof toDraft>;
    let result: Awaited<ReturnType<typeof writeStep>>;
    try {
      draft = toDraft(props.spec, values(), props.state);
      result = await writeStep(
        draft,
        props,
        reason().trim(),
        warned.confirms([draft, reason().trim()], confirmDuplicate),
      );
    } catch (refusal) {
      place(refusal, values());
      return;
    }
    const asked = [draft, reason().trim()];
    if (result.ok) {
      navigate(result.value);
      return;
    }
    if (result.failure.kind === "duplicate") {
      warned.remember(asked);
      setDuplicate(result.failure.existing);
      return;
    }
    if (result.failure.kind === "conflict") {
      // The ledger was read again; the same form shows its effect on the new one.
      setConflict(true);
      setStep("form");
      await onPreview();
      return;
    }
    if (result.failure.kind === "signed_out") {
      setSignedOut(true);
      return;
    }
    if (result.failure.kind === "unknown") {
      setProblem(
        "No sabemos si se ha guardado: la conexión falló justo al enviarlo. Mira el aviso de arriba; no hace falta que repitas nada.",
      );
      window.scrollTo?.({ top: 0 });
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
      <Show when={signedOut()}>
        <SessionNotice expired onRenewed={() => setSignedOut(false)} />
      </Show>

      <div class="register">
        <Show when={step() === "form" || wide()}>
          <form class="form" onSubmit={(event) => event.preventDefault()}>
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
          live={props.correcting === undefined}
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
