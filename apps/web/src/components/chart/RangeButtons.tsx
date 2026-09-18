// The time range of a chart, chosen with **buttons** (ADR-0017): uPlot has no
// pinch-zoom, and on a phone used to consult a portfolio, buttons are a better
// interface than a gesture anyway.
//
// A range with no point in it is **disabled and says why**, instead of leaving a
// blank chart. With manual prices recorded once or twice a year, "1 mes" is
// empty most of the time, and an empty chart reads as a broken chart.

import { For, type JSX } from "solid-js";

export type RangeKey = "1M" | "1A" | "5A" | "TODO";

export interface RangeOption {
  key: RangeKey;
  label: string;
  /** How many points the series has inside this window. */
  points: number;
}

export const RANGE_DAYS: Record<Exclude<RangeKey, "TODO">, number> = {
  "1M": 31,
  "1A": 366,
  "5A": 1827,
};

export const RANGE_LABELS: Record<RangeKey, string> = {
  "1M": "1 mes",
  "1A": "1 año",
  "5A": "5 años",
  TODO: "Todo",
};

interface RangeButtonsProps {
  options: readonly RangeOption[];
  current: RangeKey;
  onChange: (key: RangeKey) => void;
}

export const RangeButtons = (props: RangeButtonsProps): JSX.Element => (
  <fieldset class="ranges">
    <legend class="sr-only">Rango temporal</legend>
    <For each={props.options}>
      {(option) => (
        <button
          type="button"
          class={option.key === props.current ? "range is-current" : "range secondary"}
          aria-pressed={option.key === props.current}
          disabled={option.points === 0}
          title={
            option.points === 0
              ? "No hay ningún punto con datos en este rango"
              : `${option.points} ${option.points === 1 ? "punto" : "puntos"}`
          }
          onClick={() => props.onChange(option.key)}
        >
          {option.label}
        </button>
      )}
    </For>
  </fieldset>
);
