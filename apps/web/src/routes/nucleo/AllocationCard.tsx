// "¿Cómo está repartido?" — the first thing the screen answers, because it is
// the question that decides what to buy this month.
//
// Percentages only: no amount is drawn here, which is why the privacy mode
// leaves it alone (`docs/specification.md` §9.6 — the shapes of the charts stay
// visible, the amounts do not).

import { For, type JSX, Show } from "solid-js";
import { Allocation, type AllocationSegment } from "../../components/chart/index.js";
import { Badge, Figure, Section } from "../../components/index.js";
import type { WeightsView } from "../../view-models/core/index.js";

export const AllocationCard = (props: { view: WeightsView }): JSX.Element => {
  const segments = (): AllocationSegment[] =>
    props.view.classes.map((row) => ({
      key: row.assetClass,
      label: row.label,
      actualPct: row.weightPct,
      targetPct: row.targetPct,
    }));

  return (
    <Section title="Distribución del núcleo">
      <Show
        when={props.view.classes.length > 0}
        fallback={<p class="subtle flush">Todavía no hay pesos objetivo ni posiciones.</p>}
      >
        <Allocation segments={segments()} />
        <ul class="chart-legend">
          <For each={props.view.classes}>
            {(row) => (
              <li class="entry is-solid">
                <span class={`swatch is-class-${row.assetClass}`} />
                {row.label} <Figure value={row.weightPct} unit="percent" /> /{" "}
                <Figure value={row.targetPct} unit="percent" />
              </li>
            )}
          </For>
        </ul>
        <Show when={props.view.partial}>
          <p class="note">
            <Badge tone="warning">parcial</Badge> Falta el precio de {props.view.missing.join(", ")}
            , así que la barra de arriba no se puede dibujar: los pesos no se calculan sobre un
            total parcial.
          </p>
        </Show>
      </Show>
    </Section>
  );
};
