// The asset classes of the core as bullet bars (docs/design/system.md §5.21): weight, target and
// the band of the threshold, with the figures beside each bar. The summary and the Cartera draw the
// same list; the decision and the per-asset detail stay in the Cartera.

import { For, type JSX, Show } from "solid-js";
import { Bullet, Figure, Tag } from "../../components/index.js";
import { GRID, mediaQuery } from "../../shell/media.js";
import type { WeightsView } from "../../view-models/core/index.js";

const num = (text: string | undefined): number | undefined => {
  const value = Number.parseFloat(text ?? "");
  return Number.isFinite(value) ? value : undefined;
};

export const ClassBullets = (props: {
  view: WeightsView;
  threshold: string | undefined;
}): JSX.Element => {
  // On a phone the tags keep to their word, so a row does not break in two.
  const wide = mediaQuery(GRID);
  return (
    <ul class="bullets">
      <For each={props.view.classes}>
        {(row) => (
          <li class="bullet-row">
            <span class="bullet-name">
              <span class={`swatch is-${row.assetClass}`} aria-hidden="true" />
              {row.label}
              <Show when={row.belowMinimum}>
                <Tag tone="caution" icon="caution" title="bajo el mínimo">
                  {wide() ? "bajo el mínimo" : "mínimo"}
                </Tag>
              </Show>
              <Show when={row.offTargetCount > 0}>
                <Tag tone="caution" icon="caution" title="fuera de umbral">
                  {wide() ? "fuera de umbral" : "umbral"}
                </Tag>
              </Show>
            </span>
            <span class="bullet-figs">
              <Figure value={row.weightPct} unit="percent" decimals={1} class="bullet-weight" />
              <span class="meta">
                {" "}
                / <Figure value={row.targetPct} unit="percent" decimals="auto" />
              </span>
            </span>
            <Bullet
              value={num(row.weightPct)}
              target={num(row.targetPct) ?? 0}
              threshold={num(props.threshold)}
              assetClass={row.assetClass}
            />
          </li>
        )}
      </For>
    </ul>
  );
};
