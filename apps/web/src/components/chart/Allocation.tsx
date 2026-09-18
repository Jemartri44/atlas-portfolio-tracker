// The core against its target, as **two stacked bars on the same scale**:
// what there is on top, what the plan says underneath.
//
// Why not the donut ADR-0017 sketched (prompt §3.3 leaves the choice and asks
// for the reason): what the screen has to make visible is the **deviation**, and
// a deviation is a difference. On two aligned bars the difference reads as a
// length, at a glance and without comparing angles; each segment can carry its
// own label inside, so there is no legend duplicating the table below.
//
// Written in SVG by hand, not with uPlot: two rectangles per class do not
// justify a library, and ADR-0017 already said the allocation shape would be
// ours.
//
// The privacy mode does not touch it: these are **percentages**, which stay
// visible on purpose — they are the information that is useful in public and
// they give no amount away (`docs/specification.md` §9.6).

import { For, type JSX, Show } from "solid-js";

export interface AllocationSegment {
  /** Asset class, used for its colour token. */
  key: string;
  label: string;
  /** Current weight as a decimal string; absent when the total is partial. */
  actualPct?: string | undefined;
  targetPct: string;
}

const ROW_HEIGHT = 22;
const GAP = 8;

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
  y: number;
  title: string;
}): JSX.Element => (
  <>
    <For each={layout(props.values)}>
      {(box, index) => (
        <rect
          x={`${box.x}%`}
          y={props.y}
          width={`${box.width}%`}
          height={ROW_HEIGHT}
          class={`alloc-seg is-${props.segments[index()]?.key ?? "equity"}`}
        >
          <title>
            {props.title}: {props.segments[index()]?.label} {props.values[index()]?.toFixed(1)} %
          </title>
        </rect>
      )}
    </For>
  </>
);

export const Allocation = (props: { segments: readonly AllocationSegment[] }): JSX.Element => {
  const actual = (): number[] => props.segments.map((segment) => numberOf(segment.actualPct));
  const target = (): number[] => props.segments.map((segment) => numberOf(segment.targetPct));
  const hasActual = (): boolean => actual().some((value) => value > 0);

  return (
    <div class="allocation">
      <svg
        viewBox={`0 0 100 ${ROW_HEIGHT * 2 + GAP}`}
        preserveAspectRatio="none"
        height={ROW_HEIGHT * 2 + GAP}
        class="alloc-svg"
        role="img"
        aria-label="Reparto actual del núcleo frente al objetivo"
      >
        <Show
          when={hasActual()}
          fallback={
            <rect x="0" y="0" width="100%" height={ROW_HEIGHT} class="alloc-seg is-empty">
              <title>Sin datos: falta algún precio</title>
            </rect>
          }
        >
          <Bar segments={props.segments} values={actual()} y={0} title="Actual" />
        </Show>
        <Bar segments={props.segments} values={target()} y={ROW_HEIGHT + GAP} title="Objetivo" />
      </svg>
      <p class="alloc-rows tiny flush">Barra de arriba: actual. Barra de abajo: objetivo.</p>
    </div>
  );
};
