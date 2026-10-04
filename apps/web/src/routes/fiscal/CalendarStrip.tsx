// The strip of the fiscal calendar (feature 020, E4, M12): the year with the
// season, today and the dates that cost money or time, and the sentence of
// each date. It lives apart from the card with the list so the summary can
// load the short version (the strip and the next date) after its first paint.
//
// **No fiscal date is written here.** Every date, its kind and the sources
// come from `fiscalCalendar` of the domain; this only places them. There is no
// amount in it, so it reads in full with the privacy on. A date after the year
// shown sits at the right edge with its year and an arrow; a past one is
// dimmed.

import type { CivilDate } from "@atlas/domain";
import type { CalendarDate, FiscalCalendar } from "@atlas/domain/fiscal";
import { For, type JSX, Show } from "solid-js";
import { formatDate } from "../../format/date.js";
import { displayName, type NameIndex } from "../../format/names.js";

/** A triangle for the end of a window, a square for a deadline, a circle for a valuation. */
const SHAPE: Partial<Record<CalendarDate["kind"], string>> = {
  wash_sale_end: "M0-6 6 5-6 5Z",
  filing_deadline: "M-5-5H5V5H-5Z",
  year_end_valuation: "M-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0",
};

const SAYS: Record<CalendarDate["kind"], string> = {
  wash_sale_end: "Fin de la ventana de recompra",
  filing_deadline: "Plazo del Modelo",
  year_end_valuation: "Valoración de fin de año",
  season_start: "Empieza la campaña de la Renta",
  season_end: "Termina la campaña de la Renta",
};

/** What a deadline says when nobody has verified its year. */
export const UNVERIFIED = "sin verificar";

/** Where a date falls in the year, in percent: by month and day, for a drawing, not for a rule. */
const at = (date: CivilDate, year: number): number =>
  Number(date.slice(0, 4)) > year
    ? 100
    : ((Number(date.slice(5, 7)) - 1 + Number(date.slice(8, 10)) / 32) / 12) * 100;

/** The sentence of one date, without its day. */
export const calendarPhrase = (one: CalendarDate, names: NameIndex): string =>
  one.kind === "filing_deadline"
    ? `${SAYS[one.kind]} ${one.model} de ${one.year}`
    : one.kind === "wash_sale_end"
      ? `${SAYS[one.kind]}: ${displayName(names, one.sources[1])}`
      : SAYS[one.kind];

export const CalendarStrip = (props: {
  calendar: FiscalCalendar;
  today: CivilDate;
}): JSX.Element => {
  const { year, season } = props.calendar;
  const now = at(props.today, year);
  const start = at(season.start, year);
  return (
    <svg
      class="calendar-strip"
      height="56"
      width="100%"
      role="img"
      aria-label={`Calendario fiscal de ${year}: ${props.calendar.dates.length} fechas`}
    >
      <rect x={`${start}%`} width={`${at(season.end, year) - start}%`} y="8" height="28" />
      <For each={"EFMAMJJASOND".split("")}>
        {(letter, month) => (
          <text x={`${(month() / 12) * 100}%`} y="54">
            {letter}
          </text>
        )}
      </For>
      <line x1={`${now}%`} x2={`${now}%`} y1="2" y2="42" />
      <For each={props.calendar.dates.filter((one) => SHAPE[one.kind] !== undefined)}>
        {(one) => (
          <svg x={`${at(one.date, year)}%`} y="22" overflow="visible" aria-hidden="true">
            <path d={SHAPE[one.kind]} opacity={one.date < props.today ? 0.4 : 1} />
            <Show when={Number(one.date.slice(0, 4)) > year}>
              <text x="-8" y="-8" text-anchor="end">{`${one.date.slice(0, 4)} ›`}</text>
            </Show>
          </svg>
        )}
      </For>
    </svg>
  );
};

/** The short version, for the summary in the season: the strip and the next date in a line. */
export default function CalendarShort(props: {
  calendar: FiscalCalendar;
  today: CivilDate;
  names: NameIndex;
}): JSX.Element {
  const next = (): CalendarDate | undefined =>
    props.calendar.dates.find((one) => one.kind !== "season_start" && one.date >= props.today);
  return (
    <div class="calendar-short">
      <CalendarStrip calendar={props.calendar} today={props.today} />
      <Show when={next()}>
        {(one) => (
          <p class="card-note">
            Próxima fecha: <b>{formatDate(one().date)}</b> {calendarPhrase(one(), props.names)}
          </p>
        )}
      </Show>
    </div>
  );
}
