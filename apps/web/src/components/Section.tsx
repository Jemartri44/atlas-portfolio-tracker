// A block of a screen (docs/design/system.md §5.1): a card with its `<h2>` and,
// to its right, the one piece of context that belongs to the title — a date,
// a count, a tag. No grey band: the heading is content.

import { createUniqueId, type JSX, Show } from "solid-js";

interface SectionProps {
  title: string;
  /** To the right of the title: a date, a count, a tag. */
  aside?: JSX.Element | undefined;
  /** Extra classes on the card: its place in the grid, its variant. */
  class?: string | undefined;
  /** When the card is a landmark of its own, like the patrimony. */
  label?: string | undefined;
  children: JSX.Element;
}

export const Section = (props: SectionProps): JSX.Element => {
  const id = createUniqueId();
  return (
    <section
      class={`card ${props.class ?? ""}`.trimEnd()}
      aria-label={props.label}
      aria-labelledby={props.label === undefined ? `h-${id}` : undefined}
    >
      <div class="card-head">
        <h2 id={`h-${id}`}>{props.title}</h2>
        <Show when={props.aside !== undefined}>
          <div class="aside">{props.aside}</div>
        </Show>
      </div>
      {props.children}
    </section>
  );
};
