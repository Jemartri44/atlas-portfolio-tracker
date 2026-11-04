// «Exposición» in the configuration: for each asset of the core, where its split by currency and by
// region comes from — the owner's own, the default of its index, or none — and the way to change it.
// The owner does not have to know these percentages: Atlas proposes them from the index the fund
// follows, always saying which index, from which fund's portfolio and from which date. Choosing an
// index, writing one's own percentages and going back to the defaults all save at once (a separate
// object of the cloud, not the configuration): there is nothing to «Guardar» below.

import type { Asset } from "@atlas/domain";
import type { Exposures } from "@atlas/domain/portfolio";
import { createMemo, createSignal, Index, type JSX, Show } from "solid-js";
import {
  ConfirmDialog,
  Disclosure,
  Notice,
  Peek,
  Section,
  SelectField,
  Skeleton,
} from "../../components/index.js";
import { createExposure } from "../../settings-objects/use-settings-object.js";
import {
  type Dimension,
  type ExposureRowView,
  exposureRows,
  indexOptions,
  withIndex,
  withoutOwn,
  withSplit,
} from "../../view-models/core/exposure.js";
import { DimensionLine } from "./ExposureLine.jsx";
import { SplitDialog } from "./SplitDialog.jsx";

/** Where the percentages of an asset come from: what is missing, then what is proposed. */
const stateOf = (row: ExposureRowView): "owner" | "default" | "none" => {
  const states = [row.currency.state, row.region.state];
  return states.includes("none") ? "none" : states.includes("default") ? "default" : "owner";
};

const STATE_WORDS = { owner: "tuyo", default: "por defecto", none: "sin propuesta" };

/** The line of an asset: the fold never hides that its index is gone. */
const rowLabel = (row: ExposureRowView): string =>
  `${row.name} · ${STATE_WORDS[stateOf(row)]}${row.lostIndex === undefined ? "" : " · índice retirado"}`;

/** The assets in sight: the line above counts them all. */
const IN_SIGHT = 5;

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
    return state === undefined ? [] : exposureRows(props.assets, state.value, catalogue());
  });
  const counts = createMemo(() => {
    const result = { owner: 0, default: 0, none: 0 };
    for (const row of rows()) {
      result[stateOf(row)] += 1;
    }
    return result;
  });

  const initialSplit = () => {
    const target = editing();
    return target === undefined ? undefined : target.row[target.dimension].split;
  };

  /** Saves the change and keeps its error, if any, where the owner reads it. */
  const change = async (
    next: (exposures: Exposures) => Exposures,
    report = true,
  ): Promise<string | undefined> => {
    const state = ready();
    if (state === undefined) {
      return "La exposición todavía no se ha leído.";
    }
    setProblem(undefined);
    const said = await declared.save(next(state.value));
    if (report) {
      setProblem(said);
    }
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
                <p class="card-note">
                  Por defecto {counts().default} · tuyos {counts().owner} · sin propuesta{" "}
                  {counts().none}.
                </p>
                <Peek items={rows()} limit={IN_SIGHT} more={(total) => `Ver los ${total} activos`}>
                  {(shown) => (
                    <ul class="exposure-rows">
                      {/* By position: a save rebuilds the rows, and the open one stays open. */}
                      <Index each={shown()}>
                        {(row) => (
                          <li>
                            <Disclosure label={rowLabel(row())}>
                              <div class="exposure-row">
                                <Show when={row().lostIndex}>
                                  {(lost) => (
                                    <Notice severity="caution">
                                      El índice que elegiste ya no está en la tabla ({lost()}).
                                      Elige otro o vuelve a la propuesta.
                                    </Notice>
                                  )}
                                </Show>
                                <SelectField
                                  id={`index-${row().assetId}`}
                                  label="Índice que sigue"
                                  placeholder={
                                    row().proposed === undefined
                                      ? "Sin propuesta: elige uno"
                                      : `Propuesto: ${row().proposed}`
                                  }
                                  value={row().chosen}
                                  options={indexOptions()}
                                  disabled={declared.busy()}
                                  onInput={(index) =>
                                    void change((exposures) =>
                                      withIndex(exposures, row().assetId, index),
                                    )
                                  }
                                />
                                <DimensionLine
                                  dimension="currency"
                                  view={row().currency}
                                  busy={declared.busy()}
                                  onEdit={() => setEditing({ row: row(), dimension: "currency" })}
                                />
                                <DimensionLine
                                  dimension="region"
                                  view={row().region}
                                  busy={declared.busy()}
                                  onEdit={() => setEditing({ row: row(), dimension: "region" })}
                                />
                                <Show when={row().hasOwn}>
                                  <button
                                    type="button"
                                    class="secondary"
                                    disabled={declared.busy()}
                                    onClick={() => setResetting(row())}
                                  >
                                    Restablecer a los de por defecto
                                  </button>
                                </Show>
                              </div>
                            </Disclosure>
                          </li>
                        )}
                      </Index>
                    </ul>
                  )}
                </Peek>
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
              : change(
                  (exposures) => withSplit(exposures, target.row.assetId, target.dimension, split),
                  false,
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
