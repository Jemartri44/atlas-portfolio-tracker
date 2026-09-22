// A card whose body folds under its title (docs/design/system.md §7.7): the
// groups of the configuration. The title and its context stay in sight, and
// the whole head is the target that opens it.

import { type JSX, Show } from "solid-js";
import { Icon } from "./Icon.jsx";

export const Fold = (props: {
  title: string;
  /** To the right of the title: a total, a state. */
  aside?: JSX.Element;
  open?: boolean;
  /** Extra classes on the card: its place in the grid. */
  class?: string | undefined;
  children: JSX.Element;
}): JSX.Element => (
  <details class={`card fold ${props.class ?? ""}`.trimEnd()} open={props.open}>
    <summary>
      <h2>{props.title}</h2>
      <Show when={props.aside !== undefined}>
        <span class="aside">{props.aside}</span>
      </Show>
      <Icon name="chevdown" class="icon-sm chev" />
    </summary>
    <div class="fold-body">{props.children}</div>
  </details>
);
