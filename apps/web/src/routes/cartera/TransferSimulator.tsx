// "¿Cómo quedarían los pesos si traspaso?" — folded at the foot of the weights
// card (D6), because it is used on purpose and not consulted in passing, and
// because what it changes are those weights.
//
// The sentence about a transfer not being a taxable event is printed **every
// time**, not once in a help page: modelling a transfer as a sale plus a
// purchase is the mistake this whole project is built to avoid (trap 1 of
// `CLAUDE.md`, `docs/business-rules.md` §5.2).

import type { LedgerState, Settings } from "@atlas/domain";
import { simulateTransfer } from "@atlas/domain";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import {
  Amount,
  type DataColumn,
  DataTable,
  ErrorView,
  Field,
  Figure,
  Notice,
  SelectField,
  Switch,
  Tag,
} from "../../components/index.js";
import { parseDecimalInput } from "../../format/input.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { nameIndex } from "../../format/names.js";
import { attempt } from "../../ledger/query.js";
import { usePrivacy } from "../../ledger/state.js";
import { type TransferRowView, transferView } from "../../view-models/core/index.js";
import { assetOptions } from "../../view-models/options.js";

const COLUMNS: readonly DataColumn<TransferRowView>[] = [
  {
    key: "name",
    header: "Activo",
    card: "title",
    cell: (row) => row.name,
    hint: (row) => row.name,
  },
  {
    key: "before",
    header: "Peso antes",
    numeric: true,
    cell: (row) => <Figure value={row.weightBeforePct} unit="percent" />,
  },
  {
    key: "after",
    header: "Peso después",
    numeric: true,
    card: "figure",
    cell: (row) => <Figure value={row.weightAfterPct} unit="percent" />,
  },
  {
    key: "devBefore",
    header: "Desv. antes",
    numeric: true,
    cell: (row) => <Figure value={row.deviationBeforePp} unit="points" coloured />,
  },
  {
    key: "devAfter",
    header: "Desv. después",
    numeric: true,
    card: "meta",
    cell: (row) => <Figure value={row.deviationAfterPp} unit="points" coloured />,
  },
];

interface TransferSimulatorProps {
  state: LedgerState;
  date: string;
  settings: Settings;
}

export const TransferSimulator = (props: TransferSimulatorProps): JSX.Element => {
  const privacy = usePrivacy();
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [quantity, setQuantity] = createSignal("");
  const [all, setAll] = createSignal(false);

  const ready = (): boolean => from() !== "" && to() !== "" && (all() || quantity().trim() !== "");

  const result = createMemo(() => {
    if (!ready()) {
      return undefined;
    }
    // Read like every number the user types: "1.5" is refused, not guessed.
    const typed = all() ? undefined : parseDecimalInput(quantity());
    if (typed !== undefined && !typed.ok) {
      return { ok: false as const, error: { code: "invalid_number", message: typed.message } };
    }
    return attempt(() =>
      transferView(
        simulateTransfer(props.state, {
          from_asset_id: from(),
          to_asset_id: to(),
          ...(typed?.ok === true ? { quantity: typed.value } : { all: true }),
          date: props.date,
          settings: props.settings,
        }),
        nameIndex(props.state),
      ),
    );
  });

  // The two halves of the attempt, read separately: a `Show` nested inside a
  // `Show` over a discriminated union is unreadable, and this is the same thing.
  const view = () => {
    const outcome = result();
    return outcome?.ok === true ? outcome.value : undefined;
  };
  const failure = () => {
    const outcome = result();
    return outcome?.ok === false ? outcome.error : undefined;
  };

  const options = () => assetOptions(props.state, { book: "core" });

  return (
    <>
      <div class="fieldset">
        <SelectField
          id="tr-from"
          label="Desde"
          value={from()}
          placeholder="Elige el fondo de origen"
          options={options()}
          onInput={setFrom}
        />
        <SelectField
          id="tr-to"
          label="Hacia"
          value={to()}
          placeholder="Elige el fondo de destino"
          options={options()}
          onInput={setTo}
        />
        <Show when={!all()}>
          <Field
            id="tr-qty"
            kind="decimal"
            label="Participaciones"
            value={quantity()}
            onInput={setQuantity}
          />
        </Show>
        <Switch id="tr-all" label="Traspasar toda la posición" checked={all()} onChange={setAll} />
      </div>

      <Show when={failure()}>
        {(error) => <ErrorView error={error()} title="No se puede simular ese traspaso" />}
      </Show>

      <Show when={view()}>
        {(simulation) => (
          <div class="simulation">
            <p class="card-note">
              Traspaso de <Amount quantity={simulation().quantity} of="part." /> de{" "}
              {simulation().fromName} a {simulation().toName} (
              <Amount value={simulation().moved} />
              ).
            </p>
            <Notice severity="info" title="No es un hecho imponible">
              Un traspaso entre fondos <strong>no tributa</strong>: conserva la fecha de adquisición
              y el coste de los lotes de origen. No es una venta seguida de una compra.
            </Notice>
            <DataTable
              label="Pesos antes y después del traspaso"
              columns={COLUMNS}
              rows={simulation().rows}
              rowClass={(row) => (row.role === undefined ? undefined : "is-moved")}
            />
            <For each={simulation().warningsAfter}>
              {(warning) => (
                <Notice severity="caution" title="Aviso tras el traspaso simulado">
                  {describeWarning(warning, {
                    names: nameIndex(props.state),
                    privacy: privacy(),
                  })}
                </Notice>
              )}
            </For>
            <p class="card-note">
              <Tag>nada registrado</Tag> Es una simulación: la orden se da a mano en la gestora y se
              registra después.
            </p>
          </div>
        )}
      </Show>
    </>
  );
};
