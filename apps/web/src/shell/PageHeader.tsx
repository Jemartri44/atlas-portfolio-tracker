// The heading of a screen: an `<h1>` aligned left, as content, plus one line
// of context when it helps. Never a band of chrome (FR-028).

import { type JSX, Show } from "solid-js";

interface PageHeaderProps {
  title: string;
  /** One line: what this screen answers, or what it is showing right now. */
  lead?: string | undefined;
  /** Actions of the screen, to the right on a wide layout. */
  actions?: JSX.Element | undefined;
}

export const PageHeader = (props: PageHeaderProps): JSX.Element => (
  <div class="page-header">
    <div class="spread wrap">
      <h1>{props.title}</h1>
      <Show when={props.actions !== undefined}>
        <div class="row wrap">{props.actions}</div>
      </Show>
    </div>
    <Show when={props.lead !== undefined}>
      <span class="lead">{props.lead}</span>
    </Show>
  </div>
);
