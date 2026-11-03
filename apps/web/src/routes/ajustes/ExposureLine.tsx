// One dimension of an asset in the exposure card: where its split comes from (the tag and, for a
// default, the complete label), its bar and legend, and the way to edit it.

import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { ShareBar, ShareLegend, Tag, type TagTone } from "../../components/index.js";
import type { Dimension, DimensionRowView } from "../../view-models/core/exposure.js";

const STATE: Record<DimensionRowView["state"], { text: string; tone: TagTone }> = {
  owner: { text: "tuyo", tone: "accent" },
  default: { text: "por defecto", tone: "neutral" },
  none: { text: "sin propuesta", tone: "caution" },
};

const TITLES: Record<Dimension, string> = { currency: "Divisa", region: "Región" };

export const DimensionLine = (props: {
  dimension: Dimension;
  view: DimensionRowView;
  busy: boolean;
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
    <button type="button" class="secondary" disabled={props.busy} onClick={props.onEdit}>
      Editar {TITLES[props.dimension].toLowerCase()}
    </button>
  </div>
);
