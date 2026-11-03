// The small line of a tile (docs/design/system.md §5.20): the shape of one series, without axes or
// figures, so it says nothing the privacy mode hides. Hand-written SVG, no uPlot: a tile on the
// summary must not pull the chart library onto the first paint.
//
// A `null` is a hole: the line stops and starts again, never joined across (constitution V). A
// value alone between two holes is drawn as a dot, or it would not be drawn at all.

import { For, type JSX, Show } from "solid-js";

const W = 100;
const H = 32;
const PAD = 3;

/** The stretches of consecutive values, each as its points in the box. */
export const sparkRuns = (values: readonly (number | null)[]): { x: number; y: number }[][] => {
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) {
    return [];
  }
  const low = Math.min(...known);
  const high = Math.max(...known);
  const span = high - low;
  const step = values.length > 1 ? W / (values.length - 1) : 0;
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (run.length > 0) {
        runs.push(run);
      }
      run = [];
      return;
    }
    const y = span === 0 ? H / 2 : H - PAD - ((value - low) / span) * (H - 2 * PAD);
    run.push({ x: values.length > 1 ? index * step : W / 2, y });
  });
  if (run.length > 0) {
    runs.push(run);
  }
  return runs;
};

const pathOf = (run: readonly { x: number; y: number }[]): string =>
  run
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

export const Sparkline = (props: {
  values: readonly (number | null)[];
  /** The class that picks the colour and the dash of its book. */
  tone: "core" | "bucket" | "cash";
}): JSX.Element => (
  <Show when={sparkRuns(props.values).length > 0}>
    <svg
      class={`sparkline is-${props.tone}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <For each={sparkRuns(props.values)}>
        {(run) =>
          run.length === 1 ? (
            <circle cx={run[0]?.x} cy={run[0]?.y} r="1.6" />
          ) : (
            <path d={pathOf(run)} />
          )
        }
      </For>
    </svg>
  </Show>
);
