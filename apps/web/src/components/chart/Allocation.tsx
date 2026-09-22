// The portfolio against its target, as **two stacked bars on the same scale**:
// what there is, and what the plan says (docs/design/system.md §5.15).
//
// Why bars and not a donut: what the screen has to make visible is the
// **deviation**, and a deviation is a difference. On two aligned bars the
// difference reads as a length, at a glance and without comparing angles.
// Each segment is cut from its neighbour by a line of the surface colour,
// never by a border, and the class rows under the bars carry the names and
// the figures, so the colour is never alone.
//
// Written in SVG by hand: two rectangles per class do not justify a library.
// The privacy mode does not touch it: these are **percentages**, which stay
// visible on purpose (`docs/specification.md` §9.6).

import { For, type JSX, Show } from "solid-js";

export interface AllocationSegment {
  /** Asset class, used for its colour token. */
  key: string;
  label: string;
  /** Current weight as a decimal string; absent when the total is partial. */
  actualPct?: string | undefined;
  targetPct: string;
}

const numberOf = (value: string | undefined): number => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** Left offsets of each segment, as percentages of the bar. */
const layout = (values: readonly number[]): { x: number; width: number }[] => {
  const total = values.reduce((sum, value) => sum + value, 0);
  const scale = total > 0 ? 100 / total : 0;
  let cursor = 0;
  return values.map((value) => {
    const width = value * scale;
    const x = cursor;
    cursor += width;
    return { x, width };
  });
};

const Bar = (props: {
  segments: readonly AllocationSegment[];
  values: readonly number[];
  title: string;
}): JSX.Element => (
  <For each={layout(props.values)}>
    {(box, index) => (
      <rect
        x={`${box.x}%`}
        y="0"
        width={`${box.width}%`}
        height="100%"
        class={`alloc-seg is-${props.segments[index()]?.key ?? "equity"}`}
      >
        <title>
          {props.title}: {props.segments[index()]?.label} {props.values[index()]?.toFixed(1)} %
        </title>
      </rect>
    )}
  </For>
);

export const Allocation = (props: { segments: readonly AllocationSegment[] }): JSX.Element => {
  const actual = (): number[] => props.segments.map((segment) => numberOf(segment.actualPct));
  const target = (): number[] => props.segments.map((segment) => numberOf(segment.targetPct));
  const hasActual = (): boolean => actual().some((value) => value > 0);

  return (
    <div class="alloc" role="img" aria-label="Reparto actual de la cartera frente al objetivo">
      {/*
        With a partial total there is no current weight to draw: an empty rail
        looked broken (review of 2026-09-19). The target stays, and the card
        says what is missing in its pending block.
      */}
      <Show when={hasActual()}>
        <div class="alloc-row">
          <span class="alloc-label">Actual</span>
          <svg class="alloc-bar" aria-hidden="true">
            <Bar segments={props.segments} values={actual()} title="Actual" />
          </svg>
        </div>
      </Show>
      <div class="alloc-row">
        <span class="alloc-label">Objetivo</span>
        <svg class="alloc-bar" aria-hidden="true">
          <Bar segments={props.segments} values={target()} title="Objetivo" />
        </svg>
      </div>
    </div>
  );
};
