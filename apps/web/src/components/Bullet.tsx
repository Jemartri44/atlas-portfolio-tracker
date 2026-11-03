// A bullet bar (docs/design/system.md §5.21): the weight of a class as a bar, its target as a dark
// rule and the band of the threshold around the target in grey. Each class reads on its own scale
// of 0 to twice its target (at least the weight), which two stacked bars could not give.
//
// SVG with attributes, never a `style=` (CSP). The figures are printed beside it by whoever uses
// it: the bar is the shape, not the number (aria-hidden).

import { type JSX, Show } from "solid-js";

export interface BulletProps {
  /** Weight in percent; absent when it cannot be known (a partial total). */
  value?: number | undefined;
  target: number;
  /** Half-width of the band, in percentage points; absent without a threshold. */
  threshold?: number | undefined;
  /** `equity`, `fixed_income`, `gold` or `crypto`: the colour of the class. */
  assetClass: string;
}

/** Where 0 and the end of the bar are: twice the target, and never less than the weight. */
export const bulletScale = (props: BulletProps): number =>
  Math.max(
    props.target * 2,
    (props.value ?? 0) * 1.1,
    (props.target + (props.threshold ?? 0)) * 1.05,
    1,
  );

const at = (value: number, scale: number): string =>
  `${Math.min(100, Math.max(0, (value / scale) * 100)).toFixed(2)}%`;

export const Bullet = (props: BulletProps): JSX.Element => {
  const scale = () => bulletScale(props);
  const band = () =>
    props.threshold === undefined
      ? undefined
      : { from: props.target - props.threshold, to: props.target + props.threshold };
  return (
    <svg class={`bullet is-${props.assetClass}`} aria-hidden="true">
      <rect class="bullet-track" x="0" y="25%" width="100%" height="50%" rx="4" />
      <Show when={band()}>
        {(range) => (
          <rect
            class="bullet-band"
            x={at(Math.max(0, range().from), scale())}
            y="10%"
            width={`${((Math.min(range().to, scale()) - Math.max(0, range().from)) / scale()) * 100}%`}
            height="80%"
            rx="3"
          />
        )}
      </Show>
      <Show when={props.value !== undefined}>
        <rect
          class="bullet-bar"
          x="0"
          y="30%"
          width={at(props.value ?? 0, scale())}
          height="40%"
          rx="3"
        />
      </Show>
      <rect class="bullet-target" x={at(props.target, scale())} y="0" width="3" height="100%" />
    </svg>
  );
};
