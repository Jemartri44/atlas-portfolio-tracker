// `recorded_at` is an ISO 8601 UTC instant. Comparing it with a business date
// converts it to the calendar date in Europe/Madrid (data-schema.md §5).

import { ValidationError } from "../errors.js";
import type { Clock } from "../ports/clock.js";
import type { CivilDate } from "./civil-date.js";

const MADRID = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const madridDateOf = (instant: Date | string): CivilDate => {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError("invalid_instant", "recorded_at must be an ISO 8601 instant", {
      value: instant,
    });
  }
  return MADRID.format(date);
};

export const todayInMadrid = (clock: Clock): CivilDate => madridDateOf(clock.now());
