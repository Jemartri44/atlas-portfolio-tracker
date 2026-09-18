// Form controls: native `<input>`, `<select>` and `<datalist>` (ADR-0017). On a
// phone the native select gives the system wheel, which beats any combobox we
// could write, and `inputmode="decimal"` gives the numeric keypad with a comma.
//
// What the user is typing is **never masked**: the privacy mode hides the
// presentation of data, not the entry (matiz de Q6).

import { type JSX, Show } from "solid-js";

export interface Option {
  value: string;
  label: string;
  /** Second line of the option, when the identifier alone is not enough. */
  hint?: string | undefined;
}

interface BaseProps {
  id: string;
  label: string;
  value: string;
  onInput: (value: string) => void;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  class?: string | undefined;
}

const describedBy = (props: BaseProps): string | undefined => {
  const ids = [
    props.hint === undefined ? undefined : `${props.id}-hint`,
    props.error === undefined ? undefined : `${props.id}-error`,
  ].filter((id): id is string => id !== undefined);
  return ids.length === 0 ? undefined : ids.join(" ");
};

const Wrapper = (props: BaseProps & { children: JSX.Element }): JSX.Element => (
  <div class={`field${props.required === true ? " required" : ""} ${props.class ?? ""}`.trimEnd()}>
    <label for={props.id}>{props.label}</label>
    {props.children}
    <Show when={props.hint !== undefined}>
      <span class="hint" id={`${props.id}-hint`}>
        {props.hint}
      </span>
    </Show>
    <Show when={props.error !== undefined}>
      <span class="error" id={`${props.id}-error`} role="alert">
        {props.error}
      </span>
    </Show>
  </div>
);

interface TextFieldProps extends BaseProps {
  kind: "text" | "decimal" | "integer" | "date" | "textarea";
  placeholder?: string | undefined;
}

export const Field = (props: TextFieldProps): JSX.Element => (
  <Wrapper {...props}>
    <Show
      when={props.kind !== "textarea"}
      fallback={
        <textarea
          id={props.id}
          value={props.value}
          rows={3}
          aria-describedby={describedBy(props)}
          aria-invalid={props.error === undefined ? undefined : true}
          disabled={props.disabled}
          onInput={(event) => props.onInput(event.currentTarget.value)}
        />
      }
    >
      <input
        id={props.id}
        type={props.kind === "date" ? "date" : "text"}
        value={props.value}
        placeholder={props.placeholder}
        inputmode={
          props.kind === "decimal" ? "decimal" : props.kind === "integer" ? "numeric" : undefined
        }
        autocomplete="off"
        aria-describedby={describedBy(props)}
        aria-invalid={props.error === undefined ? undefined : true}
        disabled={props.disabled}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
    </Show>
  </Wrapper>
);

interface SelectFieldProps extends BaseProps {
  options: readonly Option[];
  /** Text of the empty option; absent means the field has no empty choice. */
  placeholder?: string | undefined;
}

export const SelectField = (props: SelectFieldProps): JSX.Element => (
  <Wrapper {...props}>
    <select
      id={props.id}
      value={props.value}
      aria-describedby={describedBy(props)}
      aria-invalid={props.error === undefined ? undefined : true}
      disabled={props.disabled}
      onChange={(event) => props.onInput(event.currentTarget.value)}
    >
      <Show when={props.placeholder !== undefined}>
        <option value="">{props.placeholder}</option>
      </Show>
      {props.options.map((option) => (
        <option value={option.value}>
          {option.hint === undefined ? option.label : `${option.label} — ${option.hint}`}
        </option>
      ))}
    </select>
  </Wrapper>
);

interface SwitchProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string | undefined;
}

// The same row as the status bar (`.switch-inline`): one class, one 44px
// target, and the control keeps the proportion Pico gives it.
export const Switch = (props: SwitchProps): JSX.Element => (
  <div class="field">
    <label for={props.id} class="switch-inline">
      <input
        id={props.id}
        type="checkbox"
        role="switch"
        checked={props.checked}
        aria-checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <span>{props.label}</span>
    </label>
    <Show when={props.hint !== undefined}>
      <span class="hint">{props.hint}</span>
    </Show>
  </div>
);
