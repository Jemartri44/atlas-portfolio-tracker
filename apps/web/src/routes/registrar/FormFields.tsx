// Painting a list of `FieldSpec`. Shared by the generic event form and by the
// corporate-action one, which ask for different things but ask for them the
// same way.
//
// It decides nothing: which fields exist is `specs.ts`, whether a value is
// acceptable is the domain. What is here is the mapping from a kind of field to
// a control, and the one convenience the forms allow — copying the currency
// from the chosen asset or account, which the domain still validates.

import type { LedgerState } from "@atlas/domain";
import { For, type JSX } from "solid-js";
import { Field, SelectField, Switch } from "../../components/index.js";
import { valueLabel } from "../../format/labels.js";
import { today } from "../../ledger/state.js";
import type { FieldSpec, FormValues } from "../../view-models/forms/index.js";
import { isVisible } from "../../view-models/forms/index.js";
import { derivedCurrency, optionsFor } from "../../view-models/options.js";

interface FormFieldsProps {
  fields: readonly FieldSpec[];
  values: FormValues;
  state: LedgerState;
  onChange: (values: FormValues) => void;
  /** Prefix of the control ids, so two forms on one screen cannot collide. */
  prefix?: string;
}

/**
 * Sets one field and, when another field derives from it, fills that one in
 * too. Computed in a single pass over `next`, so it does not depend on what a
 * read inside a batch would return.
 */
export const withDerived = (
  fields: readonly FieldSpec[],
  state: LedgerState,
  values: FormValues,
  name: string,
  value: string,
): FormValues => {
  const next: FormValues = { ...values, [name]: value };
  for (const field of fields) {
    if (field.derive === undefined) {
      continue;
    }
    const trigger = field.derive === "assetCurrency" ? "asset_id" : "account_id";
    if (name !== trigger) {
      continue;
    }
    const derived = derivedCurrency(state, field.derive, next);
    if (derived !== undefined) {
      next[field.name] = derived;
    }
  }
  return next;
};

export const FormFields = (props: FormFieldsProps): JSX.Element => {
  const set = (name: string, value: string): void =>
    props.onChange(withDerived(props.fields, props.state, props.values, name, value));

  const render = (field: FieldSpec): JSX.Element => {
    const value = (): string => props.values[field.name] ?? "";
    const common = {
      id: `${props.prefix ?? "f"}-${field.name}`,
      label: field.label,
      value: value(),
      ...(field.hint === undefined ? {} : { hint: field.hint }),
      ...(field.required === undefined ? {} : { required: field.required }),
      onInput: (next: string) => set(field.name, next),
      ...(field.full === true ? { class: "full" } : {}),
    };
    if (field.kind === "switch") {
      return (
        <Switch
          id={common.id}
          label={field.label}
          checked={value() === "true"}
          onChange={(checked) => set(field.name, String(checked))}
          {...(field.hint === undefined ? {} : { hint: field.hint })}
        />
      );
    }
    if (field.kind === "select") {
      const options =
        field.values !== undefined
          ? field.values.map((entry) => ({ value: entry, label: valueLabel(entry) }))
          : optionsFor(field.options ?? "accounts", {
              state: props.state,
              date: today(),
              values: props.values,
            });
      return (
        <SelectField
          {...common}
          options={options}
          {...(field.required === true ? {} : { placeholder: "Sin indicar" })}
        />
      );
    }
    return <Field {...common} kind={field.kind} />;
  };

  return (
    <div class="fieldset">
      <For each={props.fields.filter((field) => isVisible(field, props.values))}>
        {(field) => render(field)}
      </For>
    </div>
  );
};
