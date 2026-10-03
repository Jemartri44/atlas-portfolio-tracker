// The three gauges of the bucket (feature 020, E3, M10; mockup
// `indicadores.html`, card C): how much of the cap has been contributed with
// the mark of the warning, the result over what was contributed with the stop
// rule, and the weight of the bucket over net worth with its maximum.
//
// They are drawn from percentages, so they say the same with the privacy mode
// on. **No mark is written here**: the mark of the warning is the domain's
// `NEAR_LIMIT_PCT`, and the stop rule and the maximum weight come from
// `Settings`; `view-models/bucket/gauges.ts` places what it is given and this
// file draws it. The weight is the one figure that adds the two books, so it
// carries its accent rule and its sentence (constitution III).
//
// Drawn in SVG attributes, in percent, with radii in pixels: the page serves
// `style-src 'self'`.

import { type JSX, Show } from "solid-js";
import { Figure } from "../../components/index.js";
import { type GaugesView, type MeterKey, meterOf } from "../../view-models/bucket/index.js";

/** Where the words of a mark hang: centred, unless they would leave the bar. */
const anchor = (x: number): "start" | "middle" | "end" =>
  x < 12 ? "start" : x > 88 ? "end" : "middle";

export const Meter = (props: { gauges: GaugesView; which: MeterKey }): JSX.Element => (
  <Show when={meterOf(props.gauges, props.which)}>
    {(meter) => (
      <div class={meter().both ? "meter both" : "meter"}>
        <p class="meter-label">
          <span>{meter().label}</span>
          <b>
            <Figure value={meter().value} unit="percent" decimals="auto" signed={meter().signed} />
          </b>
        </p>
        <svg class="meter-bar" role="img" aria-label={meter().aria}>
          <rect class="track" x="0%" y="8" width="100%" height="10" rx="5" />
          <Show
            when={meter().shape.zero}
            fallback={
              <rect class="fill" x="0%" y="8" width={`${meter().shape.to}%`} height="10" rx="5" />
            }
          >
            <line class="zero" x1="50%" y1="4" x2="50%" y2="22" />
            <line class="stem" x1="50%" y1="13" x2={`${meter().shape.dot}%`} y2="13" />
            <circle class="dot" cx={`${meter().shape.dot}%`} cy="13" r="6" />
          </Show>
          <Show when={meter().shape.mark}>
            {(mark) => (
              <>
                <line class="warn" x1={`${mark()}%`} y1="3" x2={`${mark()}%`} y2="23" />
                <text x={`${mark()}%`} y="36" text-anchor={anchor(mark())}>
                  {meter().mark}
                </text>
              </>
            )}
          </Show>
        </svg>
      </div>
    )}
  </Show>
);
