// The bar of proportion (docs/design/system.md §5.2): parts of one whole on a single bar, cut apart by
// the colour of the surface, and its legend. The colour is never the only carrier: the figure of
// each part is written beside the bar (`ShareLegend`), and it stays in sight with the privacy mode
// on because a percentage is not an amount.
//
// The patrimony uses it with the three books (`core`, `bucket`, `cash`); the exposure with the parts
// in order of weight (`a`…`c`, and `rest` for what does not fit), which `barOf` prepares
// (`view-models/core/exposure.ts`).

import { For, type JSX } from "solid-js";

export interface BarSegment {
  /** The class of the colour: `is-<key>` in `share-bar.css`. */
  key: string;
  /** Percent of the whole, 0 to 100. */
  width: number;
}

/** A bar of segments laid one after another. The caller has checked that they are real shares. */
export const ShareBar = (props: {
  segments: readonly BarSegment[];
  thin?: boolean;
}): JSX.Element => {
  const boxes = () => {
    let cursor = 0;
    return props.segments.map((segment) => {
      const box = { key: segment.key, x: cursor, width: segment.width };
      cursor += segment.width;
      return box;
    });
  };
  return (
    <svg class={props.thin === true ? "shares is-thin" : "shares"} aria-hidden="true">
      <For each={boxes()}>
        {(box) => (
          <rect
            x={`${box.x}%`}
            y="0"
            width={`${box.width}%`}
            height="100%"
            class={`share-seg is-${box.key}`}
          />
        )}
      </For>
    </svg>
  );
};

export interface LegendEntry {
  key: string;
  label: string;
  /** The figure, already formatted. */
  figure: string;
}

/** Name and figure of each part, in the order of the bar. */
export const ShareLegend = (props: { entries: readonly LegendEntry[] }): JSX.Element => (
  <ul class="share-legend">
    <For each={props.entries}>
      {(entry) => (
        <li>
          <span class={`swatch is-${entry.key}`} aria-hidden="true" />
          {entry.label} <span class="figure">{entry.figure}</span>
        </li>
      )}
    </For>
  </ul>
);
