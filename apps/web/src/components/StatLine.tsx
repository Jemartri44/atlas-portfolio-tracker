// A line of a panel: what it is on the left, what it is worth on the right,
// separated from the next one by a hairline. Written once, because two copies
// of a layout are two places where a figure can start looking different.

import type { JSX } from "solid-js";

export const StatLine = (props: { label: string; children: JSX.Element }): JSX.Element => (
  <div class="stat-row">
    <span class="label">{props.label}</span>
    <span class="value">{props.children}</span>
  </div>
);

/** The line that closes a list with its total, in the weight of a total. */
export const TotalLine = (props: { label: JSX.Element; children: JSX.Element }): JSX.Element => (
  <div class="total-row">
    <span class="label">{props.label}</span>
    <span class="value">{props.children}</span>
  </div>
);
