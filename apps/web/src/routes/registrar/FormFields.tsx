// Painting a list of `FieldSpec`. Shared by the generic event form and by the
// corporate-action one, which ask for different things but ask for them the
// same way.
//
// It decides nothing: which fields exist is `specs.ts`, whether a value is
// acceptable is the domain. What is here is the mapping from a kind of field to
// a control, the one convenience the forms allow — copying the currency from
// the chosen asset or account, which the domain still validates — and where
// each field goes: what every record needs on top, and the bookkeeping that
// has a sensible default folded in «Más datos» (docs/design/system.md §7.4).

import type { LedgerState } from "@atlas/domain";
import { For, type JSX, Show } from "solid-js";
import { Disclosure, Field, type Option, SelectField, Switch } from "../../components/index.js";
import { today } from "../../ledger/state.js";
import { selectOptions, withoutStale } from "../../view-models/forms/choices.js";
import type { FieldSpec, FormValues } from "../../view-models/forms/index.js";
import { isVisible } from "../../view-models/forms/index.js";
import { derivedCurrency } from "../../view-models/options.js";

interface FormFieldsProps {
  fields: readonly FieldSpec[];
  values: FormValues;
  state: LedgerState;
  onChange: (values: FormValues) => void;
  /** Prefix of the control ids, so two forms on one screen cannot collide. */
  prefix?: string;
  /** What is wrong with a field, by name, written under it. */
  errors?: Readonly<Record<string, string>>;
  /**
   * Whether a field shows its value in privacy mode: a default or something the
   * user typed does, a value that came from their data does not until they
   * touch it. All of them by default: a new record holds nothing of theirs.
   */
  revealed?: ((name: string) => boolean) | undefined;
  /** A field was typed in: the form keeps it, so it is still in sight after the preview. */
  onTyped?: ((name: string) => void) | undefined;
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

/**
 * The decimals of a form that are **not** an amount or a quantity: a rate of
 * the ECB, a share of a cost, a TER. Every other decimal is money or units and
 * is masked, in privacy mode, while it is not being edited.
 */
const VISIBLE_DECIMALS = new Set(["fx_rate", "cash_fx_rate", "cost_share", "ter"]);

const isSensitive = (field: FieldSpec): boolean =>
  field.kind === "decimal" && !VISIBLE_DECIMALS.has(field.name) && !/_(pct|pp)$/.test(field.name);

/**
 * What goes in «Más datos»: the reference of the broker, where the datum comes
 * from and the notes. None of them changes what the record does, and each has
 * a default or can be left empty.
 */
const SECONDARY = new Set(["broker_ref", "source", "notes"]);

/** The options a select field offers with these values, as of today. */
const optionsOf = (field: FieldSpec, state: LedgerState, values: FormValues): Option[] =>
  selectOptions(field, state, values, today());

export const FormFields = (props: FormFieldsProps): JSX.Element => {
  const set = (name: string, value: string): void => {
    props.onChange(
      withoutStale(
        props.fields,
        props.state,
        withDerived(props.fields, props.state, props.values, name, value),
        today(),
        name,
      ),
    );
    // After the value: marking it re-renders the field, which reads the value.
    props.onTyped?.(name);
  };

  const render = (field: FieldSpec): JSX.Element => {
    const value = (): string => props.values[field.name] ?? "";
    // Getters, not values: this runs once per field, and what it hands down has
    // to follow the form — the value, the error under it and, for a list of
    // assets, which ones the chosen account allows.
    const common = {
      id: `${props.prefix ?? "f"}-${field.name}`,
      label: field.label,
      get value(): string {
        return value();
      },
      ...(field.hint === undefined ? {} : { hint: field.hint }),
      ...(field.required === undefined ? {} : { required: field.required }),
      onInput: (next: string) => set(field.name, next),
      ...(field.full === true ? { class: "full" } : {}),
      get error(): string | undefined {
        return props.errors?.[field.name];
      },
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
      return (
        <SelectField
          {...common}
          options={optionsOf(field, props.state, props.values)}
          {...(field.required === true ? {} : { placeholder: "Sin indicar" })}
        />
      );
    }
    return (
      <Field
        {...common}
        kind={field.kind}
        sensitive={isSensitive(field)}
        revealed={props.revealed?.(field.name) ?? true}
      />
    );
  };

  const shown = (): FieldSpec[] => props.fields.filter((field) => isVisible(field, props.values));
  const main = (): FieldSpec[] => shown().filter((field) => !SECONDARY.has(field.name));
  const more = (): FieldSpec[] => shown().filter((field) => SECONDARY.has(field.name));

  return (
    <>
      <div class="fieldset">
        <For each={main()}>{(field) => render(field)}</For>
      </div>
      <Show when={more().length > 0}>
        <Disclosure label="Más datos" class="more-data">
          <div class="fieldset">
            <For each={more()}>{(field) => render(field)}</For>
          </div>
        </Disclosure>
      </Show>
    </>
  );
};
