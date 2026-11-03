// Writing the split of one asset in one dimension: rows of «divisa» (or «región») and «porcentaje»,
// which have to add up to exactly 100. The sum is live and says how much is missing or left over,
// like `validateExposure` does; the percentages are typed with the comma and never with the dot.

import { Decimal, HUNDRED } from "@atlas/domain";
import type { Split } from "@atlas/domain/portfolio";
import { createEffect, createSignal, For, type JSX, Show } from "solid-js";
import { Dialog, Field, Icon, SelectField } from "../../components/index.js";
import { decimalForInput, parseDecimalInput } from "../../format/input.js";
import { formatDecimalString } from "../../format/number.js";
import { type Dimension, regionOptions } from "../../view-models/core/exposure.js";

interface Row {
  key: string;
  pct: string;
}

interface Props {
  open: boolean;
  dimension: Dimension;
  assetName: string;
  /** The split in force, to start from. */
  initial: Split | undefined;
  /** The sentence of what went wrong, or `undefined` when it is saved. */
  onSave: (split: Split) => Promise<string | undefined>;
  onClose: () => void;
}

const CURRENCY = /^[A-Z]{3}$/;

/** What the rows say: the split, or the sentence that explains why they are not one yet. */
export const readRows = (
  dimension: Dimension,
  rows: readonly Row[],
): { split?: Split; sum: string; problem?: string; rowErrors: (string | undefined)[] } => {
  let total = Decimal.ZERO;
  const split: Record<string, string> = {};
  let problem: string | undefined;
  const rowErrors = rows.map((row) => {
    const parsed = parseDecimalInput(row.pct);
    if (!parsed.ok) {
      problem ??= parsed.message;
      return parsed.message;
    }
    if (parsed.value.startsWith("-")) {
      problem ??= "Un porcentaje no puede ser negativo.";
      return "No puede ser negativo.";
    }
    total = total.add(Decimal.parse(parsed.value));
    if (dimension === "currency" && !CURRENCY.test(row.key)) {
      problem ??= "La divisa son tres letras, por ejemplo USD.";
      return "Tres letras, por ejemplo USD.";
    }
    if (row.key === "") {
      problem ??= "Elige la región.";
      return "Elige la región.";
    }
    if (row.key in split) {
      problem ??= "Hay una clave repetida.";
      return "Repetida.";
    }
    split[row.key] = parsed.value;
    return undefined;
  });
  const diff = HUNDRED.sub(total);
  if (problem === undefined && rows.length === 0) {
    problem = "Añade al menos una fila.";
  }
  if (problem === undefined && !diff.eq(Decimal.ZERO)) {
    const amount = formatDecimalString(diff.abs().toString());
    problem = diff.isPositive()
      ? `Suman ${formatDecimalString(total.toString())} %: faltan ${amount} para llegar a 100.`
      : `Suman ${formatDecimalString(total.toString())} %: sobran ${amount} para quedarse en 100.`;
  }
  return {
    ...(problem === undefined ? { split } : {}),
    sum: total.toString(),
    ...(problem === undefined ? {} : { problem }),
    rowErrors,
  };
};

export const SplitDialog = (props: Props): JSX.Element => {
  const [rows, setRows] = createSignal<Row[]>([]);
  const [failure, setFailure] = createSignal<string | undefined>(undefined);
  const [saving, setSaving] = createSignal(false);
  createEffect(() => {
    if (props.open) {
      setRows(
        Object.entries(props.initial ?? {}).map(([key, pct]) => ({
          key,
          pct: decimalForInput(pct),
        })),
      );
      setFailure(undefined);
    }
  });
  const read = () => readRows(props.dimension, rows());
  const patch = (index: number, change: Partial<Row>) =>
    setRows(rows().map((row, at) => (at === index ? { ...row, ...change } : row)));
  const what = () => (props.dimension === "currency" ? "divisa" : "región");

  const save = async (): Promise<void> => {
    const split = read().split;
    if (split === undefined) {
      return;
    }
    setSaving(true);
    const said = await props.onSave(split);
    setSaving(false);
    if (said === undefined) {
      props.onClose();
    } else {
      setFailure(said);
    }
  };

  return (
    <Dialog
      open={props.open}
      title={`Tus porcentajes por ${what()} de ${props.assetName}`}
      onClose={props.onClose}
      actions={
        <>
          <button type="button" class="secondary" onClick={props.onClose}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={read().split === undefined || saving()}
            onClick={() => void save()}
          >
            Guardar
          </button>
        </>
      }
    >
      <p class="card-note">
        Escribe el reparto real. Con la coma como decimal: 62,5. Tienen que sumar exactamente 100.
      </p>
      <For each={rows()}>
        {(row, index) => (
          <div class="split-row">
            <Show
              when={props.dimension === "currency"}
              fallback={
                <SelectField
                  id={`split-key-${index()}`}
                  label="Región"
                  placeholder="Elige"
                  value={row.key}
                  options={regionOptions()}
                  onInput={(key) => patch(index(), { key })}
                />
              }
            >
              <Field
                id={`split-key-${index()}`}
                kind="text"
                label="Divisa"
                value={row.key}
                onInput={(key) => patch(index(), { key: key.toUpperCase() })}
              />
            </Show>
            <Field
              id={`split-pct-${index()}`}
              kind="decimal"
              label="Porcentaje"
              unit="%"
              value={row.pct}
              error={row.pct === "" ? undefined : read().rowErrors[index()]}
              onInput={(pct) => patch(index(), { pct })}
            />
            <button
              type="button"
              class="secondary"
              aria-label={`Quitar la fila ${row.key === "" ? index() + 1 : row.key}`}
              onClick={() => setRows(rows().filter((_, at) => at !== index()))}
            >
              <Icon name="close" class="icon-sm" />
            </button>
          </div>
        )}
      </For>
      <button
        type="button"
        class="secondary"
        onClick={() => setRows([...rows(), { key: "", pct: "" }])}
      >
        <Icon name="plus" class="icon-sm" />
        Añadir fila
      </button>
      <p class="split-sum" role="status">
        <Show when={read().problem} fallback={<>Suman 100 %.</>}>
          {(problem) => <>{problem()}</>}
        </Show>
      </p>
      <Show when={failure()}>
        {(said) => (
          <p class="field-error" role="alert">
            <Icon name="danger" />
            <span>{said()}</span>
          </p>
        )}
      </Show>
    </Dialog>
  );
};
