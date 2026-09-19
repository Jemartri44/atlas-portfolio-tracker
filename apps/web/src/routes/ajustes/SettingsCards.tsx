// The four blocks of the configuration screen. They paint a draft and report
// what was typed; they never write: the route owns the draft and the save
// (review of 2026-09-18). The only state here is which way a window is being
// typed — a choice of the control, not of the configuration.
//
// Each block is a group that folds (docs/design/system.md §7.7): the target
// weights open, with their total live in the title; the rest closed until
// they are needed.

import type { Asset, AssetType, Settings } from "@atlas/domain";
import { For, type JSX, Show } from "solid-js";
import { Field, Fold, SelectField, Tag } from "../../components/index.js";
import { valueLabel } from "../../format/labels.js";
import { formatPercent, meaningfulDecimals } from "../../format/number.js";
import {
  type PerAssetTypeKey,
  SETTINGS_NUMBERS,
  SETTINGS_TEXTS,
  type SettingsPatch,
  settingText,
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
    <Fold
      title="Pesos objetivo"
      class="span-6"
      open
      aside={
        <>
          suman {formatPercent(total().total, { decimals: meaningfulDecimals(total().total) })}
          <Show when={!total().addsUp}>
            <Tag tone="caution" icon="caution">
              deben sumar 100 %
            </Tag>
          </Show>
        </>
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
      <p class="card-note">
        Los pesos se aplican sobre el valor total de la cartera principal y tienen que sumar 100. El
        cubo no entra aquí: es un presupuesto aparte, no una parte de la cartera.
      </p>
    </Fold>
  );
};

/** The numeric thresholds, straight from `SETTINGS_NUMBERS`. */
export const ThresholdsCard = (props: { draft: SettingsDraft }): JSX.Element => (
  <Fold class="span-6" title="Umbrales y avisos">
    <div class="fieldset">
      <For each={SETTINGS_NUMBERS}>
        {(setting) => (
          <Field
            id={`s-${String(setting.key)}`}
            kind={setting.integer === true ? "integer" : "decimal"}
            label={setting.label}
            sensitive={setting.money === true}
            revealed={setting.key in props.draft.patch}
            {...(setting.hint === undefined ? {} : { hint: setting.hint })}
            value={settingValue(props.draft.current, props.draft.patch, setting.key)}
            onInput={(raw) => props.draft.onNumber(setting.key, raw, setting.integer === true)}
          />
        )}
      </For>
    </div>
  </Fold>
);

/**
 * What the benchmark can be: the assets in force. A delisted one is not an
 * index anyone can buy; it stays on the list only while it is the one chosen,
 * marked, so that saving never swaps it silently.
 */
const benchmarkOptions = (assets: readonly Asset[], chosen: string) =>
  assets
    .filter((asset) => asset.active || asset.asset_id === chosen)
    .map((asset) => ({
      value: asset.asset_id,
      label: asset.name,
      hint: `${valueLabel(asset.asset_type)} · ${valueLabel(asset.book)}${asset.active ? "" : " · dado de baja"}`,
    }));

/** The benchmark of the bucket (rule 16) and the fiscal identity. */
export const IdentityCard = (props: {
  draft: SettingsDraft;
  assets: readonly Asset[];
}): JSX.Element => (
  <Fold class="span-6" title="Cubo e identidad fiscal">
    <div class="fieldset">
      <SelectField
        id="s-benchmark"
        label="Índice de referencia del cubo"
        hint="La alternativa aburrida contra la que se mide cada tesis."
        placeholder="Sin configurar"
        value={settingText(props.draft.current, props.draft.patch, "bucket_benchmark_asset_id")}
        options={benchmarkOptions(
          props.assets,
          settingText(props.draft.current, props.draft.patch, "bucket_benchmark_asset_id"),
        )}
        onInput={(raw) => props.draft.onOption("bucket_benchmark_asset_id", raw)}
      />
      <For each={SETTINGS_TEXTS}>
        {(setting) => (
          <Field
            id={`s-${String(setting.key)}`}
            kind="text"
            label={setting.label}
            {...(setting.hint === undefined ? {} : { hint: setting.hint })}
            value={settingText(props.draft.current, props.draft.patch, setting.key)}
            onInput={(raw) => props.draft.onText(setting.key, raw)}
          />
        )}
      </For>
    </div>
  </Fold>
);
