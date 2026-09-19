// Filters that live **in the URL** (FR-029): sharing the address or reloading
// restores them, and the back button undoes the last one instead of jumping out
// of the section. Collapsed in a `<details>` on a phone, which is the native
// disclosure ADR-0017 asks for.

import { type LedgerState, SUPPORTED_EVENT_TYPES } from "@atlas/domain";
import { useSearchParams } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Disclosure, Field, SelectField, Tag } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { eventLabel } from "../../format/labels.js";
import { displayName, nameIndex } from "../../format/names.js";
import { accountOptions, assetOptions } from "../../view-models/options.js";

/** What each filter is called on its chip: the parameter of the URL is not a word. */
const CHIP_NAMES: Record<string, string> = {
  tipo: "Tipo",
  cuenta: "Cuenta",
  activo: "Activo",
  desde: "Desde",
  hasta: "Hasta",
  q: "Texto",
};

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
  const names = nameIndex(props.state);
  /** The value of a chip as the screens name it: "Compra", "Fondos indexados", "03/09/2026". */
  const chipValue = (key: keyof MovementFilters, value: string): string =>
    key === "tipo"
      ? eventLabel(value)
      : key === "cuenta" || key === "activo"
        ? displayName(names, value)
        : key === "desde" || key === "hasta"
          ? formatDate(value)
          : value;
  const active = (): [keyof MovementFilters, string][] =>
    (["tipo", "cuenta", "activo", "desde", "hasta", "q"] as const)
      .map((key) => [key, params[key] ?? ""] as [keyof MovementFilters, string])
      .filter(([, value]) => value !== "");

  return (
    <Disclosure
      class="filters"
      open={active().length > 0}
      label={
        <>
          Filtros
          <Show when={active().length > 0}>
            {" "}
            <Tag>{active().length}</Tag>
          </Show>
          <span class="meta">
            {" "}
            · {props.shown} de {props.total}
          </span>
        </>
      }
    >
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
          options={accountOptions(props.state, undefined, { inactive: true })}
          onInput={(value) => set("cuenta", value)}
        />
        <SelectField
          id="f-activo"
          label="Activo"
          value={params.activo ?? ""}
          placeholder="Todos"
          options={assetOptions(props.state, { inactive: true })}
          onInput={(value) => set("activo", value)}
        />
        <Field
          id="f-q"
          kind="text"
          label="Buscar"
          hint="Notas, referencia del bróker, cuenta o activo."
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
                  {CHIP_NAMES[key as string]}: {chipValue(key, value)}
                  <button
                    type="button"
                    aria-label={`Quitar el filtro ${CHIP_NAMES[key as string]}`}
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
    </Disclosure>
  );
};
