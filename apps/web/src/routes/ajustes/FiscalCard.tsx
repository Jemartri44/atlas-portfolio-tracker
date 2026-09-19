// Fiscal date and repurchase window, per asset type: the fourth group of the
// configuration. What is left by default takes the documented value, so a new
// asset type never leaves the data half configured (ADR-0018).

import {
  ASSET_TYPES,
  type AssetType,
  DEFAULT_FISCAL_DATE_RULE,
  DEFAULT_WASH_SALE_WINDOW,
} from "@atlas/domain";
import { createSignal, For, type JSX, Show } from "solid-js";
import { Field, Fold, SelectField } from "../../components/index.js";
import { valueLabel } from "../../format/labels.js";
import { perAssetTypeValue } from "../../view-models/index.js";
import type { SettingsDraft } from "./SettingsCards.jsx";

const WINDOW_LABELS: Record<string, string> = { "2m": "2 meses", "1y": "1 año" };

/** "2 meses", "1 año", "45 días": a window said, never its syntax. */
const windowLabel = (window: string): string =>
  WINDOW_LABELS[window] ?? `${window.slice(0, -1)} días`;

/**
 * The repurchase window, **chosen**: two months, one year or a number of days.
 * It used to be a text box whose hint was the syntax itself, "2m, 1y o <n>d".
 */
const WindowField = (props: { draft: SettingsDraft; type: AssetType }): JSX.Element => {
  const value = (): string =>
    perAssetTypeValue(props.draft.current, props.draft.patch, "wash_sale_window", props.type);
  // Days are typed after choosing them; until then the select has to remember it.
  const [byDays, setByDays] = createSignal(/^\d+d$/.test(value()));
  const set = (raw: string): void =>
    props.draft.onPerAssetType("wash_sale_window", props.type, raw);
  return (
    <>
      <SelectField
        id={`wsw-${props.type}`}
        label={`${valueLabel(props.type)}: ventana de recompra`}
        value={byDays() ? "days" : value()}
        placeholder={`Por defecto (${windowLabel(DEFAULT_WASH_SALE_WINDOW[props.type])})`}
        options={[
          { value: "2m", label: "2 meses" },
          { value: "1y", label: "1 año" },
          { value: "days", label: "Un número de días" },
        ]}
        onInput={(raw) => {
          setByDays(raw === "days");
          if (raw !== "days") {
            set(raw);
          }
        }}
      />
      <Show when={byDays()}>
        <Field
          id={`wsd-${props.type}`}
          kind="integer"
          label={`${valueLabel(props.type)}: días de la ventana`}
          value={/^\d+d$/.test(value()) ? value().slice(0, -1) : ""}
          onInput={(raw) => set(raw.trim() === "" ? "" : `${raw.trim()}d`)}
        />
      </Show>
    </>
  );
};

/** One row per asset type: which date is fiscal, and how long the window is. */
const FiscalRow = (props: { draft: SettingsDraft; type: AssetType }): JSX.Element => (
  <>
    <SelectField
      id={`fdr-${props.type}`}
      label={`${valueLabel(props.type)}: fecha fiscal`}
      value={perAssetTypeValue(
        props.draft.current,
        props.draft.patch,
        "fiscal_date_rule",
        props.type,
      )}
      placeholder={`Por defecto (${valueLabel(DEFAULT_FISCAL_DATE_RULE[props.type]).toLowerCase()})`}
      options={[
        { value: "trade_date", label: "Fecha de contratación" },
        { value: "value_date", label: "Fecha valor" },
      ]}
      onInput={(raw) => props.draft.onPerAssetType("fiscal_date_rule", props.type, raw)}
    />
    <WindowField draft={props.draft} type={props.type} />
  </>
);

/** Fiscal date and repurchase window, per asset type. */
export const FiscalCard = (props: { draft: SettingsDraft }): JSX.Element => (
  <Fold class="span-6" title="Fecha fiscal y ventana de recompra">
    <p class="card-note">
      Por tipo de activo. Lo que dejes por defecto toma el valor indicado entre paréntesis, así que
      añadir un tipo de activo nuevo nunca deja tus datos a medias.
    </p>
    <div class="fieldset">
      <For each={ASSET_TYPES}>
        {(type: AssetType) => <FiscalRow draft={props.draft} type={type} />}
      </For>
    </div>
  </Fold>
);
