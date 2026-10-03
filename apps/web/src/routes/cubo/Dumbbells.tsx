// Each thesis against the index, on one axis (feature 020, E3, M10; mockup
// `indicadores.html`, card D): the dot is the thesis, the ring is the index,
// the thin line is 0 %, and the difference in points is written in ink with its
// sign — **the colour does not carry it**, and the shape tells the thesis from
// the index, so it reads the same without colour.
//
// Drawn from the percentages of the domain (`thesisVsIndexPct`), so it says the
// same with the privacy mode on. A thesis that cannot be compared is not drawn:
// the card already counts how many are left out, and why.

import { For, type JSX, Show } from "solid-js";
import { Figure } from "../../components/index.js";
import { type DumbbellRow, dumbbells, type ThesisRow } from "../../view-models/bucket/index.js";

const Row = (props: { row: DumbbellRow; zero: number }): JSX.Element => (
  <li>
    <span class="dumb-name">
      <span class="truncate">{props.row.name}</span>
      <span class="meta">{props.row.period}</span>
    </span>
    <Figure value={props.row.vsIndexPp} unit="points" decimals={1} class="vs" />
    <svg class="dumb-bar" role="img" aria-label={props.row.aria}>
      <line class="grid" x1={`${props.zero}%`} y1="0" x2={`${props.zero}%`} y2="22" />
      <line class="stem" x1={`${props.row.ring}%`} y1="11" x2={`${props.row.dot}%`} y2="11" />
      <circle class="ring" cx={`${props.row.ring}%`} cy="11" r="5" />
      <circle class="dot" cx={`${props.row.dot}%`} cy="11" r="6" />
    </svg>
  </li>
);

export const Dumbbells = (props: { rows: readonly ThesisRow[]; label: string }): JSX.Element => {
  const drawn = () => dumbbells(props.rows);
  return (
    <Show when={drawn().rows.length > 0}>
      <ul class="dumb" aria-label={props.label}>
        <For each={drawn().rows}>{(row) => <Row row={row} zero={drawn().zero} />}</For>
      </ul>
      <p class="dumb-legend" aria-hidden="true">
        ● la tesis · ○ el índice · la línea fina es el 0 %
      </p>
    </Show>
  );
};
