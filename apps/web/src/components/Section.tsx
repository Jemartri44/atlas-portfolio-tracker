// A block of a screen: the card, its `<h2>` and, when there is one, the figure
// or the badge that belongs to the title.
//
// `<section class="card"><header><h2>…</h2></header>…</section>` was written by
// hand eleven times, and the header of a card carries a wrapping rule that only
// shows up at 360px (`base.css`, `.card > header`): every hand-written copy is
// a chance to forget it (review of 2026-09-18).

import { type JSX, Show } from "solid-js";

interface SectionProps {
  title: string;
  /** To the right of the title: a date, a count, a badge. */
  aside?: JSX.Element | undefined;
  /** Extra classes on the card, for the blocks that style their own insides. */
  class?: string | undefined;
  /** When the card is a landmark of its own, like the patrimony. */
  label?: string | undefined;
  children: JSX.Element;
}

export const Section = (props: SectionProps): JSX.Element => (
  <section class={`card ${props.class ?? ""}`.trimEnd()} aria-label={props.label}>
    <header>
      <h2>{props.title}</h2>
      <Show when={props.aside !== undefined}>{props.aside}</Show>
    </header>
    {props.children}
  </section>
);
