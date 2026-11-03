// «Últimos movimientos» of the summary: the first entries of the list, cut at the date read, the
// valuations of a day gathered into one, under the heading of each day, and the way to all of them.

import { A } from "@solidjs/router";
import { For, type JSX } from "solid-js";
import { Icon, Section } from "../../components/index.js";
import { byDay, type ListEntry } from "../../view-models/index.js";
import { DayBlock } from "../movimientos/MovementList.jsx";

export const RecentMoves = (props: { entries: readonly ListEntry[] }): JSX.Element => (
  <Section title="Últimos movimientos" class="span-7 summary-moves" label="Últimos movimientos">
    <div class="days">
      <For each={byDay(props.entries)}>{(day) => <DayBlock day={day} level={3} />}</For>
    </div>
    <A href="/movimientos" class="card-foot">
      <span>Ver todos los movimientos</span>
      <Icon name="chevright" class="icon-sm" />
    </A>
  </Section>
);
