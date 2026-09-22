// The heading of a screen: an `<h1>` aligned left, as content, with one quiet
// line under it when it helps (a date, what the screen shows) and the actions
// of the screen to its right. Never a band of chrome (FR-028).

import { type JSX, Show } from "solid-js";

interface PageHeaderProps {
  title: string;
  /** One line under the title: the date read, or what this screen shows. */
  lead?: string | undefined;
  /** Actions of the screen, to the right of the title. */
  actions?: JSX.Element | undefined;
}

export const PageHeader = (props: PageHeaderProps): JSX.Element => (
  <div class="page-head">
    <div class="titles">
      <h1>{props.title}</h1>
      <Show when={props.lead !== undefined}>
        <p class="sub">{props.lead}</p>
      </Show>
    </div>
    <Show when={props.actions !== undefined}>
      <div class="page-actions">{props.actions}</div>
    </Show>
  </div>
);
