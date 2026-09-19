// The time range of a chart, chosen with **buttons** (ADR-0017), drawn light
// (docs/design/system.md §5.12: never four solid grey blocks). uPlot has no
// pinch-zoom, and on a phone used to consult a portfolio, buttons are a better
// interface than a gesture anyway.
//
// A range with no point in it is **disabled and says why**, instead of leaving a
// blank chart. With manual prices recorded once or twice a year, "1 mes" is
// empty most of the time, and an empty chart reads as a broken chart.

import { For, type JSX } from "solid-js";
import type { RangeKey } from "./ranges.js";

export interface RangeOption {
  key: RangeKey;
  label: string;
  /** How many points the series has inside this window. */
  points: number;
}

interface RangeButtonsProps {
  options: readonly RangeOption[];
  current: RangeKey;
  onChange: (key: RangeKey) => void;
}

export const RangeButtons = (props: RangeButtonsProps): JSX.Element => (
  <fieldset class="segmented">
    <legend class="sr-only">Rango temporal</legend>
    <For each={props.options}>
      {(option) => (
        <button
          type="button"
          aria-pressed={option.key === props.current}
          disabled={option.points === 0}
          title={
            option.points === 0
              ? "No hay ningún punto con datos en este rango"
              : `${option.points} ${option.points === 1 ? "punto" : "puntos"}`
          }
          onClick={() => props.onChange(option.key)}
        >
          <span>{option.label}</span>
        </button>
      )}
    </For>
  </fieldset>
);
