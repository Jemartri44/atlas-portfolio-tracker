// The generic form: it paints an `EventFormSpec` and walks the flow the CLI
// wizards use — fill in, **see the effect**, confirm, write (FR-043, FR-044).
//
// It validates nothing on its own beyond "this required field is empty": the
// shape is checked by `validateShape` and the invariants by the projection,
// both inside `previewEvent`. A domain error is shown as it comes, and the
// confirm button stays disabled while there is one.

import type { EventPreview, LedgerState } from "@atlas/domain";
import { A, useNavigate } from "@solidjs/router";
import { createSignal, For, type JSX, Show } from "solid-js";
import { Callout, Dialog, Field, SelectField, Switch } from "../../components/index.js";
import { valueLabel } from "../../format/labels.js";
import { nameIndex } from "../../format/names.js";
import { correct, previewDraft, recordDraft, toAppError } from "../../ledger/actions.js";
import { store, today } from "../../ledger/state.js";
import type { EventFormSpec, FieldSpec, FormValues } from "../../view-models/forms/index.js";
import {
  initialValues,
  isVisible,
  missingRequired,
  toDraft,
} from "../../view-models/forms/index.js";
import { derivedCurrency, isBucketAccount, optionsFor } from "../../view-models/options.js";
import { Preview } from "./Preview.jsx";

interface EventFormProps {
  spec: EventFormSpec;
  state: LedgerState;
  /** Correcting an existing event instead of recording a new one. */
  correcting?: { id: string; values: FormValues };
}

type Step = "form" | "preview";

export const EventForm = (props: EventFormProps): JSX.Element => {
  const navigate = useNavigate();
  const [values, setValues] = createSignal<FormValues>(
    props.correcting?.values ?? initialValues(props.spec, today()),
  );
  const [step, setStep] = createSignal<Step>("form");
  const [preview, setPreview] = createSignal<EventPreview | undefined>(undefined);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [reason, setReason] = createSignal("");
  const [duplicate, setDuplicate] = createSignal<readonly string[] | undefined>(undefined);
  const [conflict, setConflict] = createSignal(false);
  const [priorYear, setPriorYear] = createSignal(false);

  const setValue = (name: string, value: string): void => {
    const next: FormValues = { ...values(), [name]: value };
    // Prefill the currency from the chosen asset or account: a convenience,
    // never a decision — the domain still validates what is sent. Computed on
    // `next` in one pass, so it does not depend on what a read inside a batch
    // would return.
    for (const field of props.spec.fields) {
      if (field.derive === undefined) {
        continue;
      }
      const trigger = field.derive === "assetCurrency" ? "asset_id" : "account_id";
      if (name !== trigger) {
        continue;
      }
      const derived = derivedCurrency(props.state, field.derive, next);
      if (derived !== undefined) {
        next[field.name] = derived;
      }
    }
    setValues(next);
  };

  const missing = () => missingRequired(props.spec, values());

  const bucketWithoutThesis = (): boolean =>
    props.spec.type === "buy" &&
    isBucketAccount(props.state, values().account_id) &&
    (values().thesis_id ?? "") === "";

  const onPreview = async (): Promise<void> => {
    setError(undefined);
    try {
      setPreview(await previewDraft(toDraft(props.spec, values())));
      setStep("preview");
    } catch (failure) {
      setError(toAppError(failure).message);
    }
  };

  const onConfirm = async (confirmDuplicate = false): Promise<void> => {
    setError(undefined);
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
      setError(
        `Hay ${result.failure.affected.length} eventos que dependen de este: rectifícalos antes.`,
      );
      return;
    }
    setError(result.failure.error.message);
  };

  const renderField = (field: FieldSpec): JSX.Element => {
    const value = (): string => values()[field.name] ?? "";
    const common = {
      id: `f-${field.name}`,
      label: field.label,
      value: value(),
      ...(field.hint === undefined ? {} : { hint: field.hint }),
      ...(field.required === undefined ? {} : { required: field.required }),
      onInput: (next: string) => setValue(field.name, next),
      ...(field.full === true ? { class: "full" } : {}),
    };
    if (field.kind === "switch") {
      return (
        <Switch
          id={common.id}
          label={field.label}
          checked={value() === "true"}
          onChange={(checked) => setValue(field.name, String(checked))}
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
              values: values(),
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
    <>
      <Show when={conflict()}>
        <Callout tone="warning" title="El libro ha cambiado">
          Otra pestaña o la CLI han escrito mientras rellenabas. Se ha recargado el libro: vuelve a
          ver el efecto antes de confirmar. No se ha pisado nada.
        </Callout>
      </Show>

      <Show when={error() !== undefined}>
        <Callout tone="error" title="El dominio rechaza este evento">
          {error()}
        </Callout>
      </Show>

      <Show when={priorYear()}>
        <Callout
          tone="warning"
          title="Ejercicio anterior"
          action={
            <A href="/movimientos" role="button">
              Ver el libro
            </A>
          }
        >
          Registrado. El evento rectificado pertenece a un ejercicio anterior: puede afectar a una
          declaración ya presentada.
        </Callout>
      </Show>

      <Show
        when={step() === "form"}
        fallback={
          <div class="stack">
            <Preview preview={preview() as EventPreview} names={nameIndex(props.state)} />
            <div class="actions-bar">
              <button type="button" class="secondary" onClick={() => setStep("form")}>
                Volver a los datos
              </button>
              <button type="button" disabled={store.writing()} onClick={() => void onConfirm()}>
                {props.correcting === undefined ? "Registrar" : "Rectificar"}
              </button>
            </div>
          </div>
        }
      >
        <form class="form" onSubmit={(event) => event.preventDefault()}>
          <Show when={bucketWithoutThesis()}>
            <Callout
              tone="warning"
              title="Las compras del cubo exigen una tesis"
              action={
                <A href="/registrar/tesis" role="button">
                  Abrir una tesis
                </A>
              }
            >
              La regla 15 pide escribir la tesis <strong>antes</strong> de comprar: la hipótesis, el
              plazo, la condición de invalidación y el tamaño previsto. Si no hay ninguna abierta
              para esta cuenta y este activo, créala ahora y vuelve.
            </Callout>
          </Show>

          <div class="fieldset">
            <For each={props.spec.fields.filter((field) => isVisible(field, values()))}>
              {(field) => renderField(field)}
            </For>
          </div>

          <Show when={props.correcting !== undefined}>
            <Field
              id="correct-reason"
              kind="text"
              label="Motivo de la rectificación"
              required
              hint="Se anula el original y se registra el corregido; el motivo queda en el libro."
              value={reason()}
              onInput={setReason}
              class="full"
            />
          </Show>

          <div class="actions-bar">
            <button
              type="button"
              disabled={
                missing().length > 0 || (props.correcting !== undefined && reason().trim() === "")
              }
              onClick={() => void onPreview()}
            >
              Ver el efecto
            </button>
          </div>
          <Show when={missing().length > 0}>
            <p class="tiny">
              Faltan campos obligatorios:{" "}
              {missing()
                .map(
                  (name) => props.spec.fields.find((field) => field.name === name)?.label ?? name,
                )
                .join(", ")}
              .
            </p>
          </Show>
        </form>
      </Show>

      <Dialog
        open={duplicate() !== undefined}
        title="Ya existe un evento igual"
        onClose={() => setDuplicate(undefined)}
        actions={
          <>
            <button type="button" class="secondary" onClick={() => setDuplicate(undefined)}>
              Cancelar
            </button>
            <button type="button" disabled={store.writing()} onClick={() => void onConfirm(true)}>
              Registrar de todas formas
            </button>
          </>
        }
      >
        <p>
          Otro evento del libro tiene la misma huella (
          {(duplicate() ?? []).map((id) => (
            <A href={`/movimientos/${id}`}>{id}</A>
          ))}
          ). Si es una repetición legítima —dos aportaciones idénticas el mismo día— confírmalo.
        </p>
      </Dialog>
    </>
  );
};
