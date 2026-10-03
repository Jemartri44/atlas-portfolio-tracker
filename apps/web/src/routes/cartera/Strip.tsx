// The deviation of an asset class as a strip (feature 020, E3, M5; mockup
// `indicadores.html`, card A): a track of ±5 pp, the mark of the target in the
// middle, and a dot where the weight is, joined to the middle by a stem.
//
// **In ink and without a band.** Whether a class is off target is the domain's
// to say, per asset (`deviation_above_threshold`), so the strip of a class
// carries neither the band of the threshold nor a coloured dot: the full
// strip, with both, is the `Gauge` of each asset. What a class says about its
// assets is a count taken from those warnings, never a comparison of figures
// here (decision (c) of docs/design/system.md).
//
// Positions are SVG attributes, in percent, with radii in pixels: the page
// serves `style-src 'self'`, so a position written as a style would be blocked.

import { type JSX, Show } from "solid-js";
import { formatPoints } from "../../format/number.js";

/** What the track spans on each side of the target, in points. */
export const STRIP_SPAN_PP = 5;

/** Where the dot goes, in percent of the track: clamped, so a far deviation stays on it. */
export const stripX = (deviation: string): number => {
  const dev = Number.parseFloat(deviation);
  if (!Number.isFinite(dev)) {
    return 50;
  }
  return Math.max(3, Math.min(97, 50 + (dev / STRIP_SPAN_PP) * 50));
};

export const Strip = (props: { deviation: string | undefined }): JSX.Element => (
  <Show when={props.deviation}>
    {(deviation) => (
      <svg
        class="strip"
        role="img"
        aria-label={`Desviación de ${formatPoints(deviation())} frente al objetivo`}
      >
        <rect class="track" x="0%" y="7" width="100%" height="6" rx="3" />
        <line class="zero" x1="50%" y1="2" x2="50%" y2="18" />
        <line class="stem" x1="50%" y1="10" x2={`${stripX(deviation())}%`} y2="10" />
        <circle class="dot" cx={`${stripX(deviation())}%`} cy="10" r="6" />
      </svg>
    )}
  </Show>
);
