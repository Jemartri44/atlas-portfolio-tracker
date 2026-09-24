// What a form says went wrong, and where (FR-043): a refusal about one field
// goes under it, the rest next to the button, and the whole error of a write
// with the button that fixes it (inventory V6). Out of `EventForm` because the
// form is long enough already (decision (g) of prompt 007).

import { type Accessor, createSignal } from "solid-js";
import { toAppError } from "../../ledger/errors.js";
import type { AppError } from "../../ledger/state.js";
import type { FieldSpec, FormValues } from "../../view-models/forms/index.js";
import { fieldErrorOf, inputErrors } from "../../view-models/forms/index.js";
import { revealField } from "./FormActions.jsx";

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
  const [problem, setProblem] = createSignal<string | undefined>(undefined);
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
    place: (refusal, values) => {
      const onField = fieldErrorOf(refusal, fields, values);
      if (onField === undefined) {
        setProblem(toAppError(refusal).message);
      } else {
        show({ [onField.field]: onField.message });
      }
    },
  };
};
