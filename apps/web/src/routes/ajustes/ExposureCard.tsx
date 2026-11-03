// «Exposición» in the configuration: for each asset of the core, where its split by currency and by
// region comes from — the owner's own, the default of its index, or none — and the way to change it.
// The owner does not have to know these percentages: Atlas proposes them from the index the fund
// follows, always saying which index, from which fund's portfolio and from which date. Choosing an
// index, writing one's own percentages and going back to the defaults all save at once (a separate
// object of the cloud, not the configuration): there is nothing to «Guardar» below.

import type { Asset } from "@atlas/domain";
import type { Exposures } from "@atlas/domain/portfolio";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import {
  ConfirmDialog,
  Notice,
  Section,
  SelectField,
  ShareBar,
  ShareLegend,
  Skeleton,
  StatLine,
  Tag,
  type TagTone,
} from "../../components/index.js";
import { createExposure } from "../../exposure/use-exposure.js";
import {
  type Dimension,
  type DimensionRowView,
  type ExposureRowView,
  exposureRows,
  indexOptions,
  withIndex,
  withoutOwn,
  withSplit,
} from "../../view-models/core/exposure.js";
import { SplitDialog } from "./SplitDialog.jsx";

const STATE: Record<DimensionRowView["state"], { text: string; tone: TagTone }> = {
  owner: { text: "tuyo", tone: "accent" },
  default: { text: "por defecto", tone: "neutral" },
  none: { text: "sin propuesta", tone: "caution" },
};

const TITLES: Record<Dimension, string> = { currency: "Divisa", region: "Región" };

const DimensionLine = (props: {
  dimension: Dimension;
  view: DimensionRowView;
  onEdit: () => void;
}): JSX.Element => (
  <div class="exposure-line">
    <p class="exposure-line-head">
      <strong>{TITLES[props.dimension]}</strong>
      <Tag tone={STATE[props.view.state].tone}>{STATE[props.view.state].text}</Tag>
      <Show when={props.view.label}>{(label) => <span class="meta">{label()}</span>}</Show>
    </p>
    <Show
      when={props.view.bar}
      fallback={<p class="meta">Sin propuesta: elige un índice o escribe tus porcentajes.</p>}
    >
      {(bar) => (
        <>
          <ShareBar segments={bar().segments} thin />
          <ShareLegend entries={bar().legend} />
        </>
      )}
    </Show>
    <button type="button" class="secondary" onClick={props.onEdit}>
      Editar {TITLES[props.dimension].toLowerCase()}
    </button>
  </div>
);

export const ExposureCard = (props: { assets: readonly Asset[] }): JSX.Element => {
  const declared = createExposure();
  const [problem, setProblem] = createSignal<string | undefined>(undefined);
  const [editing, setEditing] = createSignal<{ row: ExposureRowView; dimension: Dimension }>();
  const [resetting, setResetting] = createSignal<ExposureRowView>();

  const catalogue = createMemo(
    () =>
      new Map(
        props.assets.map((asset) => [
          asset.asset_id,
          asset.isin === undefined ? {} : { isin: asset.isin },
        ]),
      ),
  );
  const ready = () => {
    const state = declared.state();
    return state.kind === "ready" ? state : undefined;
  };
  const rows = createMemo(() => {
    const state = ready();
    return state === undefined ? [] : exposureRows(props.assets, state.exposures, catalogue());
  });
  const counts = createMemo(() => {
    const result = { owner: 0, default: 0, none: 0 };
    for (const row of rows()) {
      const states = [row.currency.state, row.region.state];
      result[states.includes("none") ? "none" : states.includes("default") ? "default" : "owner"] +=
        1;
    }
    return result;
  });

  const initialSplit = () => {
    const target = editing();
    return target === undefined ? undefined : target.row[target.dimension].split;
  };

  /** Saves the change and keeps its error, if any, where the owner reads it. */
  const change = async (next: (exposures: Exposures) => Exposures): Promise<string | undefined> => {
    const state = ready();
    if (state === undefined) {
      return "La exposición todavía no se ha leído.";
    }
    setProblem(undefined);
    const said = await declared.save(next(state.exposures));
    setProblem(said);
    return said;
  };

  return (
    <div id="exposicion" class="span-12">
      <Section title="Exposición" class="exposure-card">
        <p class="card-note">
          Cómo se reparte la cartera principal por divisa y por región. No tienes que saber estos
          porcentajes: Atlas propone los del índice que sigue cada fondo, diciendo cuál y de cuándo.
          Si conoces los tuyos, escríbelos y mandan sobre los de por defecto.
        </p>
        <Show when={problem()}>
          {(said) => (
            <Notice severity="danger" title="No se ha guardado">
              {said()}
            </Notice>
          )}
        </Show>
        <Show
          when={declared.state().kind !== "failed"}
          fallback={
            <Notice severity="danger" title="No se ha podido leer la exposición">
              {(declared.state() as { message: string }).message}
            </Notice>
          }
        >
          <Show when={ready()} fallback={<Skeleton lines={4} />}>
            {(state) => (
              <>
                <Show when={state().unreadable}>
                  <Notice severity="caution" title="El fichero de exposición no se puede leer">
                    Solo se usan los de por defecto. Lo que guardes lo sustituye.
                  </Notice>
                </Show>
                <div class="exposure-counts">
                  <StatLine label="Con porcentajes por defecto">{counts().default}</StatLine>
                  <StatLine label="Con tus porcentajes">{counts().owner}</StatLine>
                  <StatLine label="Sin propuesta">{counts().none}</StatLine>
                </div>
                <ul class="exposure-rows">
                  <For each={rows()}>
                    {(row) => (
                      <li class="exposure-row">
                        <h3>{row.name}</h3>
                        <Show when={row.lostIndex}>
                          {(lost) => (
                            <Notice severity="caution">
                              El índice que elegiste ya no está en la tabla ({lost()}). Elige otro o
                              vuelve a la propuesta.
                            </Notice>
                          )}
                        </Show>
                        <SelectField
                          id={`index-${row.assetId}`}
                          label="Índice que sigue"
                          placeholder={
                            row.proposed === undefined
                              ? "Sin propuesta: elige uno"
                              : `Propuesto: ${row.proposed}`
                          }
                          value={row.chosen}
                          options={indexOptions()}
                          disabled={declared.busy()}
                          onInput={(index) =>
                            void change((exposures) => withIndex(exposures, row.assetId, index))
                          }
                        />
                        <DimensionLine
                          dimension="currency"
                          view={row.currency}
                          onEdit={() => setEditing({ row, dimension: "currency" })}
                        />
                        <DimensionLine
                          dimension="region"
                          view={row.region}
                          onEdit={() => setEditing({ row, dimension: "region" })}
                        />
                        <Show when={row.hasOwn}>
                          <button type="button" class="secondary" onClick={() => setResetting(row)}>
                            Restablecer a los de por defecto
                          </button>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </>
            )}
          </Show>
        </Show>

        <SplitDialog
          open={editing() !== undefined}
          dimension={editing()?.dimension ?? "currency"}
          assetName={editing()?.row.name ?? ""}
          initial={initialSplit()}
          onSave={(split) => {
            const target = editing();
            return target === undefined
              ? Promise.resolve("No hay nada que guardar.")
              : change((exposures) =>
                  withSplit(exposures, target.row.assetId, target.dimension, split),
                );
          }}
          onClose={() => setEditing(undefined)}
        />
        <ConfirmDialog
          open={resetting() !== undefined}
          title={`Restablecer ${resetting()?.name ?? ""}`}
          confirm="Restablecer"
          destructive
          onConfirm={() => {
            const target = resetting();
            setResetting(undefined);
            if (target !== undefined) {
              void change((exposures) => withoutOwn(exposures, target.assetId));
            }
          }}
          onClose={() => setResetting(undefined)}
        >
          <p>
            Se borran tus porcentajes de este activo y vuelven los de por defecto de su índice. El
            índice que elegiste se queda.
          </p>
        </ConfirmDialog>
      </Section>
    </div>
  );
};
