// "¿Se me da bien esto?" — the trading statistics.
//
// Commissions over traded capital go **first**, as in `atlas bucket`: with a
// small account and fixed fees, that ratio decides the result before the
// judgement does, and it is probably the most revealing number of the panel
// (rule 14).

import { type JSX, Show } from "solid-js";
import { Amount, Badge, Figure, Section, StatLine } from "../../components/index.js";
import type { StatsView } from "../../view-models/bucket/index.js";

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

    <StatLine label="Tasa de acierto">
      <Figure value={props.view.hitRatePct} unit="percent" />
    </StatLine>
    <StatLine label="Ganancia media">
      <Amount value={props.view.averageWin} signed coloured currency={false} />
    </StatLine>
    <StatLine label="Pérdida media">
      <Amount value={props.view.averageLoss} signed coloured currency={false} />
    </StatLine>
    <StatLine label="Esperanza por tesis">
      <Amount value={props.view.expectancy} signed coloured currency={false} />
    </StatLine>
    <StatLine label="Máxima caída">
      <Amount value={props.view.maxDrawdown} currency={false} />
      <Show when={props.view.drawdownFrom !== undefined}>
        <span class="tiny">
          de {props.view.drawdownFrom} a {props.view.drawdownTo}
        </span>
      </Show>
    </StatLine>
    <StatLine label="Resultado frente al índice">
      <Amount value={props.view.vsIndexTotal} signed coloured currency={false} />
      <Show when={props.view.vsIndexMissing > 0}>
        <span class="tiny">{props.view.vsIndexMissing} sin dato</span>
      </Show>
    </StatLine>

    <Show when={props.view.excluded.length > 0}>
      <p class="note">
        <Badge tone="warning">fuera de las medias</Badge> Las tesis {props.view.excluded.join("; ")}
        : sus ventas consumieron lotes comprados por otra tesis, porque el FIFO es global entre
        todas, así que su resultado no es solo suyo.
      </p>
    </Show>
  </Section>
);
