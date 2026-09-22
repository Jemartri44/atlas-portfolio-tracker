// The deviation against the threshold (D7 of docs/design/system.md): a track
// with the band of ±threshold, the mark of the target in the middle, and a dot
// where the deviation is — in the colour of a warning when the domain said it
// is off target. Only the geometry is decided here; whether it is off target
// arrives from the warning (decision (c)).
//
// Drawn in SVG attributes: the page serves `style-src 'self'`, so a position
// written as an inline style would simply be blocked.

import { type JSX, Show } from "solid-js";

const WIDTH = 72;
const MIDDLE = WIDTH / 2;
/** Half the band: ±threshold spans 48 of the 72 units. */
const HALF_BAND = 24;

/** Where the dot goes: the threshold at the edge of the band, clamped to the track. */
export const gaugeX = (deviation: string, threshold: string): number => {
  const dev = Number.parseFloat(deviation);
  const limit = Number.parseFloat(threshold);
  if (!Number.isFinite(dev) || !Number.isFinite(limit) || limit <= 0) {
    return MIDDLE;
  }
  return Math.max(4, Math.min(WIDTH - 4, MIDDLE + (dev / limit) * HALF_BAND));
};

export const Gauge = (props: {
  deviation: string | undefined;
  threshold: string | undefined;
  off: boolean;
}): JSX.Element => (
  <Show when={props.deviation !== undefined && props.threshold !== undefined}>
    <svg class={props.off ? "gauge is-off" : "gauge"} viewBox="0 0 72 12" aria-hidden="true">
      <rect class="track" x="0" y="4" width="72" height="4" rx="2" />
      <rect class="band" x={MIDDLE - HALF_BAND} y="4" width={HALF_BAND * 2} height="4" />
      <line class="zero" x1={MIDDLE} y1="1" x2={MIDDLE} y2="11" />
      <circle
        class="dot"
        cx={gaugeX(props.deviation as string, props.threshold as string)}
        cy="6"
        r="4"
      />
    </svg>
  </Show>
);
