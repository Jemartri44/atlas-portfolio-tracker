// The four blocks of the configuration screen. They paint a draft and report
// what was typed; they never write: the route owns the draft and the save
// (review of 2026-09-18). The only state here is which way a window is being
// typed — a choice of the control, not of the configuration.

import {
  ASSET_TYPES,
  type Asset,
  type AssetType,
  DEFAULT_FISCAL_DATE_RULE,
  DEFAULT_WASH_SALE_WINDOW,
  type Settings,
} from "@atlas/domain";
import { createSignal, For, type JSX, Show } from "solid-js";
import { Field, Section, SelectField, Tag } from "../../components/index.js";
import { valueLabel } from "../../format/labels.js";
import { formatDecimalString } from "../../format/number.js";
import {
  type PerAssetTypeKey,
  perAssetTypeValue,
  SETTINGS_NUMBERS,
  SETTINGS_TEXTS,
  type SettingsPatch,
  settingValue,
  targetWeightTotal,
} from "../../view-models/index.js";

/** What the blocks need from the route: the draft, and where a keystroke goes. */
export interface SettingsDraft {
  /** The configuration in force at the date of the screen. */
  current: Settings;
  patch: SettingsPatch;
  onNumber: (key: keyof Settings, raw: string, integer: boolean) => void;
  onText: (key: keyof Settings, raw: string) => void;
  onOption: (key: keyof Settings, raw: string) => void;
  onPerAssetType: (key: PerAssetTypeKey, type: AssetType, raw: string) => void;
}

interface WeightsProps {
  /**
   * The active assets of the core, plus an inactive one **only** while it still
   * carries a weight in force: hiding it would drop its weight silently on the
   * next save, and showing it lets the user take it to zero.
   */
  assets: readonly Asset[];
  values: Record<string, string>;
  onWeight: (assetId: string, raw: string) => void;
}

/** Rule 3 of the plan: the weights of the core, which have to add up to 100. */
export const WeightsCard = (props: WeightsProps): JSX.Element => {
  const total = () => targetWeightTotal(props.values);
  return (
    <Section
      title="Pesos objetivo del núcleo"
      aside={
        <span class="hstack tiny">
          suman {formatDecimalString(total().total, { decimals: 2 })} de 100
          <Show when={!total().addsUp}>
            <Tag tone="caution">no suman 100</Tag>
          </Show>
        </span>
      }
    >
      <div class="fieldset">
        <For each={props.assets}>
          {(asset) => (
            <Field
              id={`w-${asset.asset_id}`}
              kind="decimal"
              label={`${asset.name} (%)`}
              hint={asset.active ? undefined : "Dado de baja: déjalo vacío para quitarle el peso."}
              value={props.values[asset.asset_id] ?? ""}
              onInput={(raw) => props.onWeight(asset.asset_id, raw)}
            />
          )}
        </For>
      </div>
      <p class="note">
        Los pesos se aplican sobre el valor total del núcleo y tienen que sumar 100. El cubo no
        entra aquí: es un presupuesto aparte, no una parte de la cartera.
      </p>
    </Section>
  );
};

/** The numeric thresholds, straight from `SETTINGS_NUMBERS`. */
export const ThresholdsCard = (props: { draft: SettingsDraft }): JSX.Element => (
  <Section title="Umbrales y avisos">
    <div class="fieldset">
      <For each={SETTINGS_NUMBERS}>
        {(setting) => (
          <Field
            id={`s-${String(setting.key)}`}
            kind={setting.integer === true ? "integer" : "decimal"}
            label={setting.label}
            {...(setting.hint === undefined ? {} : { hint: setting.hint })}
            value={settingValue(props.draft.current, props.draft.patch, setting.key)}
            onInput={(raw) => props.draft.onNumber(setting.key, raw, setting.integer === true)}
          />
        )}
      </For>
    </div>
  </Section>
);

/** The benchmark of the bucket (rule 16) and the fiscal identity. */
export const IdentityCard = (props: {
  draft: SettingsDraft;
  assets: readonly Asset[];
}): JSX.Element => (
  <Section title="Cubo e identidad fiscal">
    <div class="fieldset">
      <SelectField
        id="s-benchmark"
        label="Índice de referencia del cubo"
        hint="La alternativa aburrida contra la que se mide cada tesis (regla 16)."
        placeholder="Sin configurar"
        value={settingValue(props.draft.current, props.draft.patch, "bucket_benchmark_asset_id")}
        options={props.assets.map((asset) => ({
          value: asset.asset_id,
          label: asset.name,
          hint: `${valueLabel(asset.asset_type)} · ${valueLabel(asset.book)}`,
        }))}
        onInput={(raw) => props.draft.onOption("bucket_benchmark_asset_id", raw)}
      />
      <For each={SETTINGS_TEXTS}>
        {(setting) => (
          <Field
            id={`s-${String(setting.key)}`}
            kind="text"
            label={setting.label}
            {...(setting.hint === undefined ? {} : { hint: setting.hint })}
            value={settingValue(props.draft.current, props.draft.patch, setting.key)}
            onInput={(raw) => props.draft.onText(setting.key, raw)}
          />
        )}
      </For>
    </div>
  </Section>
);

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
  <Section title="Fecha fiscal y ventana de recompra">
    <p class="subtle">
      Por tipo de activo. Lo que dejes por defecto toma el valor indicado entre paréntesis, así que
      añadir un tipo de activo nuevo nunca deja el libro a medias.
    </p>
    <div class="fieldset">
      <For each={ASSET_TYPES}>
        {(type: AssetType) => <FiscalRow draft={props.draft} type={type} />}
      </For>
    </div>
  </Section>
);
