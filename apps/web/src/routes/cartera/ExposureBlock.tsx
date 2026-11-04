// How the core is exposed by currency and by region: the money of the core split by the currency
// its value moves with and by the part of the world it depends on. The split of each asset is the
// owner's own, else the default of its index, else none — and the block says which, always in
// sight, even folded on the phone (its summary line carries the warning). The percentages are not
// amounts and stay visible with the privacy mode on.
//
// Core only. A price missing means no figure at all, like the rest of the screen.

import type { CoreWeights } from "@atlas/domain";
import { DEFAULT_INDEX_TABLES, type Exposure, exposure } from "@atlas/domain/portfolio";
import { A } from "@solidjs/router";
import { createMemo, For, type JSX, Show } from "solid-js";
import {
  FoldSection,
  Notice,
  ShareBar,
  ShareLegend,
  Skeleton,
  StatLine,
} from "../../components/index.js";
import { createExposure } from "../../exposure/use-exposure.js";
import type { NameIndex } from "../../format/names.js";
import {
  type DimensionView,
  type ExposureBlockView,
  exposureBlockView,
} from "../../view-models/core/exposure.js";

const SETTINGS = "/ajustes/configuracion#exposicion";

const Dimension = (props: { title: string; view: DimensionView }): JSX.Element => (
  <div class="exposure-dimension">
    <h3>{props.title}</h3>
    <Show
      when={props.view.bar}
      fallback={
        <Notice severity="info" title="Sin propuesta">
          Falta el reparto de {props.view.missing.join(", ")}: elígelo en{" "}
          <A href={SETTINGS}>Ajustes</A>.
        </Notice>
      }
    >
      {(bar) => (
        <>
          <ShareBar segments={bar().segments} />
          <ShareLegend entries={bar().legend} />
        </>
      )}
    </Show>
  </div>
);

const Ready = (props: { view: ExposureBlockView; unreadable: boolean }): JSX.Element => (
  <>
    <Show when={props.unreadable}>
      <Notice severity="caution" title="El fichero de exposición no se puede leer">
        Solo se usan los valores por defecto. Rehazla en <A href={SETTINGS}>Ajustes</A>.
      </Notice>
    </Show>
    <Show
      when={!props.view.partial}
      fallback={
        <Notice severity="caution" title="Sin cifra">
          Falta un precio de la cartera principal.
        </Notice>
      }
    >
      <div class="exposure-dimensions">
        <Dimension title="Por divisa" view={props.view.currency} />
        <Dimension title="Por región" view={props.view.region} />
      </div>
      <div class="exposure-counts">
        <StatLine label="Con porcentajes por defecto">{props.view.counts.default}</StatLine>
        <StatLine label="Con tus porcentajes">{props.view.counts.owner}</StatLine>
        <StatLine label="Sin propuesta">{props.view.counts.none}</StatLine>
      </div>
      <Show when={props.view.defaults.length > 0}>
        <ul class="exposure-sources">
          <For each={props.view.defaults}>{(line) => <li>{line}</li>}</For>
        </ul>
      </Show>
      <For each={props.view.lost}>
        {(lost) => (
          <Notice severity="caution">
            El índice que elegiste para {lost.asset} ya no está en la tabla ({lost.index}). Elige
            otro en <A href={SETTINGS}>Ajustes</A>.
          </Notice>
        )}
      </For>
    </Show>
  </>
);

export const ExposureBlock = (props: {
  weights: CoreWeights;
  catalogue: ReadonlyMap<string, { isin?: string }>;
  names: NameIndex;
}): JSX.Element => {
  const declared = createExposure();
  const view = createMemo(() => {
    const state = declared.state();
    if (state.kind !== "ready") {
      return undefined;
    }
    const computed: Exposure = exposure(
      props.weights,
      state.exposures,
      props.catalogue,
      DEFAULT_INDEX_TABLES,
    );
    return { view: exposureBlockView(computed, props.names), unreadable: state.unreadable };
  });
  /** The warning, when there is one, before the figure: a folded card never hides it. */
  const summaryLine = (): string => {
    const state = declared.state();
    if (state.kind === "failed") {
      return "No se ha podido leer";
    }
    const shown = view();
    if (shown === undefined) {
      return "Cargando…";
    }
    if (shown.unreadable) {
      return "El fichero de exposición no se puede leer";
    }
    if (shown.view.partial) {
      return "Sin cifra: falta un precio";
    }
    const { none, owner, default: byDefault } = shown.view.counts;
    return none > 0
      ? `${none} sin propuesta de reparto`
      : `${owner} con tus porcentajes, ${byDefault} por defecto`;
  };
  return (
    <FoldSection title="Exposición" class="exposure-block" summary={summaryLine()}>
      <Show
        when={declared.state().kind !== "failed"}
        fallback={
          <Notice severity="danger" title="No se ha podido leer la exposición">
            {(declared.state() as { message: string }).message}
          </Notice>
        }
      >
        <Show when={view()} fallback={<Skeleton lines={3} />}>
          {(ready) => <Ready view={ready().view} unreadable={ready().unreadable} />}
        </Show>
      </Show>
    </FoldSection>
  );
};
