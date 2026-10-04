// The fiscal calendar of `/fiscal` (feature 020, E4, M12): the strip of the
// year and, under it, the list of every date, which is also its accessible
// equivalent. A past date says so, and a year with no verified deadline is
// said, never supposed.

import type { CivilDate, LedgerEvent } from "@atlas/domain";
import { type FiscalCalendar, fiscalCalendar } from "@atlas/domain/fiscal";
import { For, type JSX, Show } from "solid-js";
import { Section } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import type { NameIndex } from "../../format/names.js";
import { CalendarStrip, calendarPhrase, UNVERIFIED } from "./CalendarStrip.jsx";

export const CalendarCard = (props: {
  calendar: FiscalCalendar;
  today: CivilDate;
  names: NameIndex;
}): JSX.Element => (
  <Section title="Calendario fiscal" class="span-12" label="Calendario fiscal">
    <CalendarStrip calendar={props.calendar} today={props.today} />
    <ul class="calendar-list">
      <For each={props.calendar.dates}>
        {(one) => (
          <li>
            <b>{formatDate(one.date)}</b> {calendarPhrase(one, props.names)}
            <Show when={one.date < props.today}> · pasado</Show>
          </li>
        )}
      </For>
      <For each={props.calendar.unknown_deadlines}>
        {(one) => (
          <li>
            Plazo del Modelo {one.model} de {one.year}: {UNVERIFIED}
          </li>
        )}
      </For>
    </ul>
  </Section>
);

/** The calendar of the ledger read at a date: what the screen puts in its grid. */
export const LedgerCalendar = (props: {
  events: readonly LedgerEvent[];
  today: CivilDate;
  names: NameIndex;
}): JSX.Element => (
  <CalendarCard
    calendar={fiscalCalendar(props.events, props.today)}
    today={props.today}
    names={props.names}
  />
);
