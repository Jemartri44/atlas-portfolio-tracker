// Form controls: native `<input>`, `<select>` and `<textarea>` (ADR-0017),
// styled by our own base (`styles/controls.css`, ADR-0023). On a phone the
// native select gives the system wheel, which beats any combobox we could
// write, and `inputmode="decimal"` gives the numeric keypad with a comma.
//
// Every field has the same anatomy (docs/design/system.md §5.10): the label
// above, the control, then the hint and — when there is one — the error **in
// line**, under the field it is about, with its icon.
//
// Privacy (§5.10): what the user **types** is never hidden, but what the
// application **shows** is. A field of an amount or a quantity that arrives
// filled in — a correction, the configuration, a default — is masked while it
// does not have the focus, and shows its value as soon as it gets it. Once the
// user has typed in it, the value is theirs and stays in sight: hiding a
// figure the moment it is written would leave nothing to check before saving.

import { createSignal, type JSX, Show } from "solid-js";
import { MASK } from "../format/privacy.js";
import { usePrivacy } from "../ledger/state.js";
import { Icon } from "./Icon.jsx";

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
      <p class="hint" id={`${props.id}-hint`}>
        {props.hint}
      </p>
    </Show>
    <Show when={props.error !== undefined}>
      <p class="field-error" id={`${props.id}-error`} role="alert">
        <Icon name="danger" />
        <span>{props.error}</span>
      </p>
    </Show>
  </div>
);

interface TextFieldProps extends BaseProps {
  kind: "text" | "decimal" | "integer" | "date" | "textarea";
  placeholder?: string | undefined;
  /** An amount or a quantity: masked, in privacy mode, until it has the focus. */
  sensitive?: boolean | undefined;
}

export const Field = (props: TextFieldProps): JSX.Element => {
  const privacy = usePrivacy();
  const [focused, setFocused] = createSignal(false);
  const [typed, setTyped] = createSignal(false);
  const masked = (): boolean =>
    props.sensitive === true && privacy() && !focused() && !typed() && props.value !== "";
  return (
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
          value={masked() ? MASK : props.value}
          title={masked() ? "Oculto: al entrar en el campo se ve su valor" : undefined}
          placeholder={props.placeholder}
          inputmode={
            props.kind === "decimal" ? "decimal" : props.kind === "integer" ? "numeric" : undefined
          }
          autocomplete="off"
          aria-describedby={describedBy(props)}
          aria-invalid={props.error === undefined ? undefined : true}
          disabled={props.disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onInput={(event) => {
            // The value first: marking the field as typed re-renders it, and
            // the control would be read back after that with the old value.
            props.onInput(event.currentTarget.value);
            setTyped(true);
          }}
        />
      </Show>
    </Wrapper>
  );
};

interface SelectFieldProps extends BaseProps {
  options: readonly Option[];
  /** Text of the empty option; absent means the field has no empty choice. */
  placeholder?: string | undefined;
}

export const SelectField = (props: SelectFieldProps): JSX.Element => (
  <Wrapper {...props}>
    <div class="control has-chevron">
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
      <Icon name="chevdown" class="icon-sm chev" />
    </div>
  </Wrapper>
);

interface SwitchProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string | undefined;
}

/** A boolean: the switch and its words on one 44px row, the hint under it. */
export const Switch = (props: SwitchProps): JSX.Element => (
  <div class="field">
    <label for={props.id} class="switch-row">
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
      <p class="hint">{props.hint}</p>
    </Show>
  </div>
);
