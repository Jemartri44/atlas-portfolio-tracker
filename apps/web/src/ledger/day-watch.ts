import type { CivilDate } from "@atlas/domain";
import { createSignal } from "solid-js";

const [dayChanges, markDayChange] = createSignal(0);
let watchingDay = false;

/**
 * An open tab does not know it is a new day: once, the first time the date is read, a
 * check each minute (cheap, and with no time-zone arithmetic of its own) tells the
 * readers of `today()` when Madrid's day has changed, so the screens do not keep
 * valuing the portfolio at yesterday's date.
 */
const watchDay = (clockDay: () => CivilDate): void => {
  if (watchingDay || typeof setInterval === "undefined") {
    return;
  }
  watchingDay = true;
  let seen = clockDay();
  setInterval(() => {
    const now = clockDay();
    if (now !== seen) {
      seen = now;
      markDayChange((count) => count + 1);
    }
  }, 60_000);
};

/** The day of `clockDay`, as a signal that changes when the day does. */
export const readDay = (clockDay: () => CivilDate): CivilDate => {
  dayChanges();
  watchDay(clockDay);
  return clockDay();
};
