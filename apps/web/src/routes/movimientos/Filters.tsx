// Filters that live **in the URL** (FR-029): sharing the address or reloading
// restores them, and the back button undoes the last one instead of jumping out
// of the section. Collapsed in a `<details>` on a phone, which is the native
// disclosure ADR-0017 asks for.

import { type LedgerState, SUPPORTED_EVENT_TYPES } from "@atlas/domain";
import { useSearchParams } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Field, SelectField } from "../../components/index.js";
import { eventLabel } from "../../format/labels.js";
import { accountOptions, assetOptions } from "../../view-models/options.js";

export interface MovementFilters {
  [key: string]: string | undefined;
  tipo?: string;
  cuenta?: string;
  activo?: string;
  desde?: string;
  hasta?: string;
  q?: string;
}

/** Types offered, in a sensible order: what is registered daily comes first. */
const TYPE_ORDER = [
  "buy",
  "sell",
  "cash_deposit",
  "cash_withdrawal",
  "dividend",
  "valuation",
  "order_placed",
  "transfer",
  "swap",
  "corporate_action",
  "thesis_opened",
  "settings_changed",
  "reversal",
];

const typeOptions = (): { value: string; label: string }[] =>
  [...SUPPORTED_EVENT_TYPES]
    .sort((a, b) => {
      const left = TYPE_ORDER.indexOf(a);
      const right = TYPE_ORDER.indexOf(b);
      return (left === -1 ? TYPE_ORDER.length : left) - (right === -1 ? TYPE_ORDER.length : right);
    })
    .map((type) => ({ value: type, label: eventLabel(type) }));

export const Filters = (props: {
  state: LedgerState;
  total: number;
  shown: number;
}): JSX.Element => {
  const [params, setParams] = useSearchParams<MovementFilters>();
  const set = (key: keyof MovementFilters, value: string): void => {
    setParams({ [key]: value === "" ? undefined : value }, { replace: false, scroll: false });
  };
  const active = (): [keyof MovementFilters, string][] =>
    (["tipo", "cuenta", "activo", "desde", "hasta", "q"] as const)
      .map((key) => [key, params[key] ?? ""] as [keyof MovementFilters, string])
      .filter(([, value]) => value !== "");

  return (
    <details class="filters" open={active().length > 0}>
      <summary>
        <span class="row">
          <span>Filtros</span>
          <Show when={active().length > 0}>
            <span class="badge">{active().length}</span>
          </Show>
        </span>
        <span class="tiny">
          {props.shown} de {props.total}
        </span>
      </summary>
      <div class="body">
        <SelectField
          id="f-tipo"
          label="Tipo"
          value={params.tipo ?? ""}
          placeholder="Todos"
          options={typeOptions()}
          onInput={(value) => set("tipo", value)}
        />
        <SelectField
          id="f-cuenta"
          label="Cuenta"
          value={params.cuenta ?? ""}
          placeholder="Todas"
          options={accountOptions(props.state)}
          onInput={(value) => set("cuenta", value)}
        />
        <SelectField
          id="f-activo"
          label="Activo"
          value={params.activo ?? ""}
          placeholder="Todos"
          options={assetOptions(props.state)}
          onInput={(value) => set("activo", value)}
        />
        <Field
          id="f-q"
          kind="text"
          label="Buscar"
          hint="Identificador, notas, referencia del bróker, cuenta o activo."
          value={params.q ?? ""}
          onInput={(value) => set("q", value)}
        />
        <Field
          id="f-desde"
          kind="date"
          label="Desde"
          value={params.desde ?? ""}
          onInput={(value) => set("desde", value)}
        />
        <Field
          id="f-hasta"
          kind="date"
          label="Hasta"
          value={params.hasta ?? ""}
          onInput={(value) => set("hasta", value)}
        />
        <Show when={active().length > 0}>
          <div class="chips full">
            <For each={active()}>
              {([key, value]) => (
                <span class="chip">
                  {key}: {value}
                  <button
                    type="button"
                    aria-label={`Quitar el filtro ${key}`}
                    onClick={() => set(key, "")}
                  >
                    ×
                  </button>
                </span>
              )}
            </For>
            <button
              type="button"
              class="secondary"
              onClick={() =>
                setParams(
                  {
                    tipo: undefined,
                    cuenta: undefined,
                    activo: undefined,
                    desde: undefined,
                    hasta: undefined,
                    q: undefined,
                  },
                  { scroll: false },
                )
              }
            >
              Quitar todos
            </button>
          </div>
        </Show>
      </div>
    </details>
  );
};
