// Which tax year is being looked at, kept **in the URL** like the date of the
// analytical screens: reloading keeps it, sharing the address keeps it, and
// the back button of the phone undoes the last change.
//
// The default is the calendar year before the day of the query, which is the
// one there is to declare. "Cerrado" is never used for "past": it is reserved
// for a year with a return recorded (block 1).

import { useSearchParams } from "@solidjs/router";
import { For, type JSX } from "solid-js";
import { Icon } from "../../components/index.js";

const PARAM = "ejercicio";

export interface YearChoice {
  year: number;
  /** A return of this year is recorded: the option says so. */
  filed: boolean;
}

/** The year in force and how to change it. Anything unreadable falls back to the default. */
export const useYear = (
  fallback: () => number,
): { year: () => number; set: (value: string) => void } => {
  const [params, setParams] = useSearchParams<{ ejercicio?: string }>();
  return {
    year: (): number => {
      const raw = Number(params[PARAM]);
      return Number.isInteger(raw) && raw > 1900 ? raw : fallback();
    },
    set: (value: string): void => {
      const next = Number(value) === fallback() ? undefined : value;
      setParams({ [PARAM]: next }, { scroll: false });
    },
  };
};

export const YearPicker = (props: {
  year: number;
  choices: readonly YearChoice[];
  onChange: (value: string) => void;
}): JSX.Element => (
  <label class="year-picker" title="Ejercicio que estás mirando">
    <Icon name="calendar" class="icon-sm" />
    <span class="year-label">Ejercicio</span>
    <select
      class="year-select"
      value={String(props.year)}
      onInput={(event) => props.onChange(event.currentTarget.value)}
    >
      <For each={props.choices}>
        {(choice) => (
          <option value={String(choice.year)}>
            {choice.filed ? `${choice.year} · declarado` : String(choice.year)}
          </option>
        )}
      </For>
    </select>
  </label>
);
