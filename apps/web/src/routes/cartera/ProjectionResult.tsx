// What the projection gives: a figure per case, what they have discounted, the chart and what costs
// and taxes take at the horizon, or the reason there is no figure.

import { For, type JSX, Show } from "solid-js";
import { Amount, Notice, StatLine } from "../../components/index.js";
import type { ProjectionView } from "../../view-models/core/projection.js";
import { ProjectionChart } from "./ProjectionChart.jsx";

export const ProjectionResult = (props: { view: ProjectionView }): JSX.Element => (
  <Show
    when={props.view.gap === undefined}
    fallback={
      <Notice severity="info" title="Sin cifra">
        Todavía no se puede proyectar: {props.view.gap}.
      </Notice>
    }
  >
    <StatLine label="Hoy">
      <Amount value={props.view.start} missingReason="sin dato" />
    </StatLine>
    <For each={props.view.cases}>
      {(shown) => (
        <StatLine label={`${shown.label}, dentro de ${props.view.years} años`}>
          <Amount value={shown.value} />
        </StatLine>
      )}
    </For>
    <p class="card-note">{props.view.discounted}</p>
    <Show when={props.view.plot}>{(plot) => <ProjectionChart plot={plot()} />}</Show>
    <h3 class="block-title">Qué se llevan los costes</h3>
    <table class="table is-sm projection-costs">
      <caption class="meta">A {props.view.years} años, sin inflación</caption>
      <thead>
        <tr>
          <th scope="col">Caso</th>
          <th scope="col">TER y comisiones</th>
          <th scope="col">Impuesto al vender</th>
        </tr>
      </thead>
      <tbody>
        <For each={props.view.cases}>
          {(shown) => (
            <tr>
              <td>{shown.label}</td>
              <td>
                <Amount value={shown.fees} />
              </td>
              <td>
                <Amount value={shown.tax} />
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
    <Show when={props.view.terMissing}>
      {(left) => (
        <p class="card-note">
          El TER no alcanza a <Amount value={left()} /> de activos que no lo declaran.
        </p>
      )}
    </Show>
  </Show>
);
