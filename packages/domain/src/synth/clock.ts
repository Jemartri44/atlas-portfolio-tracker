// Clock of the synthetic generator (feature 003): every instant derives from a
// business date, never from the wall clock, and it only moves forward, so the
// `recorded_at` values and the ULIDs are monotonic in file order.

import type { CivilDate } from "../dates/civil-date.js";
import type { Clock } from "../ports/clock.js";

const SECOND = 1000;

export class SyntheticClock implements Clock {
  private current: number;

  constructor(start = "2026-09-01T18:00:00.000Z") {
    this.current = Date.parse(start);
  }

  /** Moves to 18:00 UTC of `date`, or one second past the last instant if that is later. */
  at(date: CivilDate): Date {
    this.current = Math.max(Date.parse(`${date}T18:00:00.000Z`), this.current + SECOND);
    return new Date(this.current);
  }

  now(): Date {
    return new Date(this.current);
  }
}
