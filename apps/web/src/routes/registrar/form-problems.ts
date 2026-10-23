// What a form says went wrong, and where: a refusal about one field goes under it, the rest next to
// the button, and the whole error of a write with the button that fixes it. Out of `EventForm`
// because the form is long enough already.

import { type Accessor, createSignal } from "solid-js";
import { toAppError } from "../../ledger/errors.js";
import type { AppError } from "../../ledger/state.js";
import type { FieldSpec, FormValues } from "../../view-models/forms/index.js";
import { fieldErrorOf, inputErrors } from "../../view-models/forms/index.js";
import { revealField } from "./FormActions.jsx";

/** The problem next to a form's button: a sentence, or the error of a refusal. */
export const createProblem = (): {
  problem: Accessor<string | undefined>;
  setProblem: (problem: string | undefined) => void;
  refuse: (error: AppError) => void;
} => {
  const [sentence, setSentence] = createSignal<string | undefined>(undefined);
  // Kept as the error, not as its text: the text follows the privacy mode while it is on screen.
  const [refusal, setRefusal] = createSignal<AppError | undefined>(undefined);
  return {
    problem: () => refusal()?.message ?? sentence(),
    setProblem: (text) => {
      setRefusal(undefined);
      setSentence(text);
    },
    refuse: (error) => {
      setSentence(undefined);
      setRefusal(error);
    },
  };
};

export interface FormProblems {
  fieldErrors: Accessor<Record<string, string>>;
  setFieldErrors: (errors: Record<string, string>) => void;
  problem: Accessor<string | undefined>;
  setProblem: (problem: string | undefined) => void;
  failure: Accessor<AppError | undefined>;
  setFailure: (failure: AppError | undefined) => void;
  /** Clears what was said and checks every number can be read; false when one cannot. */
  readable: (values: FormValues) => boolean;
  /** A refusal of the domain: under its field when it is about one, by the button if not. */
  place: (refusal: unknown, values: FormValues) => void;
}

export const useFormProblems = (fields: readonly FieldSpec[]): FormProblems => {
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string>>({});
  const { problem, setProblem, refuse } = createProblem();
  const [failure, setFailure] = createSignal<AppError | undefined>(undefined);

  const show = (errors: Record<string, string>): void => {
    setFieldErrors(errors);
    const first = fields.find((field) => errors[field.name] !== undefined);
    if (first !== undefined) {
      revealField(`f-${first.name}`);
    }
  };

  return {
    fieldErrors,
    setFieldErrors,
    problem,
    setProblem,
    failure,
    setFailure,
    readable: (values) => {
      setProblem(undefined);
      setFailure(undefined);
      const unreadable = inputErrors(fields, values);
      if (Object.keys(unreadable).length > 0) {
        show(unreadable);
        return false;
      }
      setFieldErrors({});
      return true;
    },
    place: (refused, values) => {
      const onField = fieldErrorOf(refused, fields, values);
      if (onField === undefined) {
        refuse(toAppError(refused));
      } else {
        show({ [onField.field]: onField.message });
      }
    },
  };
};
