// A line of a panel: what it is on the left, what it is worth on the right.
//
// Defined twice, identically, in the two cards of Cubo before this. Eleven lines
// each is not much code, but two copies of a layout are two places where a
// figure can start looking different from its neighbour.

import type { JSX } from "solid-js";

export const StatLine = (props: { label: string; children: JSX.Element }): JSX.Element => (
  <div class="spread stat-line">
    <span class="subject">{props.label}</span>
    <span class="row">{props.children}</span>
  </div>
);
