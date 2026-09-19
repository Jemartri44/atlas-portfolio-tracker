// The asset classes of the core against their targets (docs/design/system.md
// §7.5): on a phone, a row in two lines per class — the weight on top, the
// target and the deviation under it; from 1024px, a table with the total at its
// foot. Both say below-the-minimum and partial with a word, never a colour.

import { For, type JSX, Show } from "solid-js";
import { Amount, Figure, Tag } from "../../components/index.js";
import type { WeightClassRow, WeightsView } from "../../view-models/core/index.js";

/** What a class row says besides its figures: below the minimum, partial. */
const ClassTags = (props: { row: WeightClassRow }): JSX.Element => (
  <>
    <Show when={props.row.belowMinimum}>
      <Tag tone="caution" icon="caution">
        bajo el mínimo
      </Tag>
    </Show>
    <Show when={props.row.partial}>
      <Tag icon="half">parcial</Tag>
    </Show>
  </>
);

const ClassName = (props: { row: WeightClassRow }): JSX.Element => (
  <span class="class-name">
    <span class={`swatch is-${props.row.assetClass}`} aria-hidden="true" />
    <span>{props.row.label}</span>
    <ClassTags row={props.row} />
  </span>
);

/**
 * A phone: one class in two lines — weight on top, target and deviation under
 * it. With a partial total there are no weights at all, only targets, and then
 * these rows are the answer at every width: a table of «sin dato» says less.
 */
export const ClassRows = (props: { view: WeightsView }): JSX.Element => (
  <ul
    class={props.view.partial ? "classes" : "classes only-narrow is-sm"}
    aria-label="Pesos por tipo de activo"
  >
    <For each={props.view.classes}>
      {(row) => (
        <li class="class-row">
          <ClassName row={row} />
          <Show when={!props.view.partial}>
            <Figure value={row.weightPct} unit="percent" class="weight" />
          </Show>
          <span class="target">
            objetivo <Figure value={row.targetPct} unit="percent" decimals="auto" />
          </span>
          <Show when={!props.view.partial}>
            <Figure value={row.deviationPp} unit="points" class="dev" />
          </Show>
        </li>
      )}
    </For>
  </ul>
);

/** From 1024px: the same classes as a table, with the total at its foot. */
export const ClassTable = (props: { view: WeightsView }): JSX.Element => (
  <table class="table only-wide is-sm" aria-label="Pesos por tipo de activo">
    <thead>
      <tr>
        <th scope="col">Tipo de activo</th>
        <th scope="col" class="num">
          Valor
        </th>
        <th scope="col" class="num">
          Peso
        </th>
        <th scope="col" class="num">
          Objetivo
        </th>
        <th scope="col" class="num">
          Desviación
        </th>
      </tr>
    </thead>
    <tbody>
      <For each={props.view.classes}>
        {(row) => (
          <tr>
            <td>
              <ClassName row={row} />
            </td>
            <td class="num">
              <Amount value={row.value} />
            </td>
            <td class="num">
              <Figure value={row.weightPct} unit="percent" class="weight" />
            </td>
            <td class="num">
              <Figure value={row.targetPct} unit="percent" decimals="auto" />
            </td>
            <td class="num">
              <Figure value={row.deviationPp} unit="points" />
            </td>
          </tr>
        )}
      </For>
    </tbody>
    <tfoot>
      <tr>
        <td>Total de la cartera</td>
        <td class="num">
          <Amount value={props.view.total} missingReason="ninguna posición tiene precio" />
        </td>
        <td colSpan={3} />
      </tr>
    </tfoot>
  </table>
);
