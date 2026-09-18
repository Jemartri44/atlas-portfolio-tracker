// The date every analytical screen is read at (`asOf`, ADR-0016), kept **in the
// URL**: reloading keeps it, sharing the address keeps it, and the phone's back
// button undoes the last change instead of leaving the screen — which is what
// FR-043 asks for and what the filters of Movimientos already do.
//
// "Hoy" is the default and it is not stored: an empty parameter means today, so
// the address of the screen as it is normally read is just `/nucleo`.

import { type CivilDate, isCivilDate } from "@atlas/domain";
import { useSearchParams } from "@solidjs/router";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { today } from "../ledger/state.js";

const PARAM = "fecha";

/**
 * The date in force and how to change it. A malformed parameter falls back to
 * today rather than propagating: the comparisons downstream are lexicographic,
 * so a word would quietly pick the last price of the whole ledger.
 */
export const useAsOf = (): {
  date: () => CivilDate;
  isToday: () => boolean;
  set: (value: string) => void;
} => {
  const [params, setParams] = useSearchParams<{ fecha?: string }>();
  const date = (): CivilDate => {
    const raw = params[PARAM];
    return raw !== undefined && isCivilDate(raw) ? raw : today();
  };
  return {
    date,
    isToday: () => date() === today(),
    set: (value: string): void => {
      const next = value === "" || value === today() ? undefined : value;
      setParams({ [PARAM]: next }, { scroll: false });
    },
  };
};

interface AsOfPickerProps {
  date: CivilDate;
  isToday: boolean;
  onChange: (value: string) => void;
  /** One line about what the date does on this screen. */
  hint?: string | undefined;
}

export const AsOfPicker = (props: AsOfPickerProps): JSX.Element => (
  <>
    <div class="asof">
      <label for="asof">
        <span class="tiny">Fecha</span>
        <input
          id="asof"
          type="date"
          value={props.date}
          onInput={(event) => props.onChange(event.currentTarget.value)}
        />
      </label>
      <Show when={!props.isToday}>
        <button type="button" class="secondary" onClick={() => props.onChange("")}>
          Hoy
        </button>
      </Show>
    </div>
    <Show when={props.hint !== undefined}>
      <span class="asof-hint tiny">{props.hint}</span>
    </Show>
  </>
);
