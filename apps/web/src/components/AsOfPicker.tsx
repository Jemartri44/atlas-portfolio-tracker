// The date every analytical screen is read at (`asOf`, ADR-0016), kept **in the
// URL**: reloading keeps it, sharing the address keeps it, and the phone's back
// button undoes the last change instead of leaving the screen.
//
// Drawn compact, to the right of the title (docs/design/system.md §5.13): a
// calendar, "Hoy," and the date, over the native date input that opens the
// system picker. It used to be a label, a field and a sentence that took a
// sixth of a phone before any content.
//
// "Hoy" is the default and it is not stored: an empty parameter means today, so
// the address of the screen as it is normally read is just `/cartera`.

import { type CivilDate, isCivilDate } from "@atlas/domain";
import { useSearchParams } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { formatDate } from "../format/date.js";
import { today } from "../ledger/state.js";
import { Icon } from "./Icon.jsx";

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
  /** What the date does on this screen, for the title of the control. */
  hint?: string | undefined;
}

/** Opens the system picker where the browser allows it; typing still works where not. */
const openPicker = (input: HTMLInputElement): void => {
  try {
    input.showPicker?.();
  } catch {
    // Not allowed without a gesture in some browsers: the input keeps its focus,
    // and the date can still be typed. Nothing else to do.
  }
};

export const AsOfPicker = (props: AsOfPickerProps): JSX.Element => (
  <div class="asof-group">
    <label class="asof" title={props.hint}>
      <Icon name="calendar" class="icon-sm" />
      <Show when={props.isToday}>
        <span class="today">Hoy,</span>
      </Show>
      <span class="num">{formatDate(props.date)}</span>
      <input
        id="asof"
        class="asof-input"
        type="date"
        value={props.date}
        aria-label="Fecha de consulta"
        onClick={(event) => openPicker(event.currentTarget)}
        onInput={(event) => props.onChange(event.currentTarget.value)}
      />
    </label>
    <Show when={!props.isToday}>
      <button type="button" class="secondary" onClick={() => props.onChange("")}>
        Hoy
      </button>
    </Show>
  </div>
);
