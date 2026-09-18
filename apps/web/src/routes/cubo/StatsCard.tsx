// "¿Se me da bien esto?" — the trading statistics.
//
// Commissions over traded capital go **first**, as in `atlas bucket`: with a
// small account and fixed fees, that ratio decides the result before the
// judgement does, and it is probably the most revealing number of the panel
// (rule 14).

import { type JSX, Show } from "solid-js";
import { Amount, Badge, Figure, Section } from "../../components/index.js";
import type { StatsView } from "../../view-models/bucket/index.js";

const Line = (props: { label: string; children: JSX.Element }): JSX.Element => (
  <div class="spread stat-line">
    <span class="subject">{props.label}</span>
    <span class="row">{props.children}</span>
  </div>
);

export const StatsCard = (props: { view: StatsView }): JSX.Element => (
  <Section
    title="Estadísticas de operativa"
    aside={
      <span class="tiny">
        {props.view.closedTheses} cerradas · {props.view.realizedOperations} realizaciones
      </span>
    }
  >
    <div class="headline">
      <span class="subject">Comisiones sobre capital operado</span>
      <span class="row">
        <Figure value={props.view.feesPct} unit="percent" class="big" />
        <span class="tiny">
          <Amount value={props.view.fees} currency={false} /> de{" "}
          <Amount value={props.view.tradedCapital} />
        </span>
      </span>
    </div>

    <Line label="Tasa de acierto">
      <Figure value={props.view.hitRatePct} unit="percent" />
    </Line>
    <Line label="Ganancia media">
      <Amount value={props.view.averageWin} signed coloured currency={false} />
    </Line>
    <Line label="Pérdida media">
      <Amount value={props.view.averageLoss} signed coloured currency={false} />
    </Line>
    <Line label="Esperanza por tesis">
      <Amount value={props.view.expectancy} signed coloured currency={false} />
    </Line>
    <Line label="Máxima caída">
      <>
        <Amount value={props.view.maxDrawdown} currency={false} />
        <Show when={props.view.drawdownFrom !== undefined}>
          <span class="tiny">
            de {props.view.drawdownFrom} a {props.view.drawdownTo}
          </span>
        </Show>
      </>
    </Line>
    <Line label="Resultado frente al índice">
      <>
        <Amount value={props.view.vsIndexTotal} signed coloured currency={false} />
        <Show when={props.view.vsIndexMissing > 0}>
          <span class="tiny">{props.view.vsIndexMissing} sin dato</span>
        </Show>
      </>
    </Line>

    <Show when={props.view.excluded.length > 0}>
      <p class="note">
        <Badge tone="warning">fuera de las medias</Badge> {props.view.excluded.join(", ")}: sus
        ventas consumieron lotes comprados por otra tesis, así que su resultado no es suyo (FIFO
        global, ADR-0009).
      </p>
    </Show>
  </Section>
);
