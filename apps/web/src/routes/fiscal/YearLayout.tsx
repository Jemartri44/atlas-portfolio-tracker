// Where each card of the year goes (docs/design/system.md §7.8). On a computer, columns that go their
// own way: the base and the losses against the quota, then the criteria with a model each and what
// was filed; the boxes and the simulation across. On a phone, the base first, because it is the
// figure looked for, and everything else folded with its state in a line.

import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { GRID, mediaQuery } from "../../shell/media.js";

export interface YearCards {
  base: () => JSX.Element;
  /** Absent when there is no estimate to give: the losses take its column. */
  estimate?: (() => JSX.Element) | undefined;
  losses: () => JSX.Element;
  doubtful: () => JSX.Element;
  settled: () => JSX.Element;
  filing: () => JSX.Element;
  model720: () => JSX.Element;
  model721: () => JSX.Element;
  boxes: () => JSX.Element;
  sale: () => JSX.Element;
}

export const YearLayout = (props: { cards: YearCards }): JSX.Element => {
  const wide = mediaQuery(GRID);
  const cards = (): YearCards => props.cards;
  return (
    <Show
      when={wide()}
      fallback={
        <>
          {cards().base()}
          {cards().estimate?.()}
          {cards().model720()}
          {cards().model721()}
          {cards().doubtful()}
          {cards().settled()}
          {cards().losses()}
          {cards().boxes()}
          {cards().sale()}
          {cards().filing()}
        </>
      }
    >
      <div class="stack span-5">
        {cards().base()}
        <Show when={cards().estimate}>{cards().losses()}</Show>
      </div>
      <div class="stack span-7">
        <Show when={cards().estimate} fallback={cards().losses()}>
          {cards().estimate?.()}
        </Show>
      </div>
      <div class="stack span-6">
        {cards().doubtful()}
        {cards().model721()}
      </div>
      <div class="stack span-6">
        {cards().settled()}
        {cards().filing()}
        {cards().model720()}
      </div>
      {cards().boxes()}
      {cards().sale()}
    </Show>
  );
};
