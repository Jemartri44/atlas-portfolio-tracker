// "¿Se me da bien esto?" — the bucket against the index, and the statistics of
// its trading (docs/design/system.md §7.6).
//
// The card opens with the one figure the bucket is judged by: its result
// against what the same money would have done in the index (rule 16: the
// reference is the index, not zero), as a share of what was put in. It is a
// percentage, so it stays in sight with the privacy mode on; the amount goes
// under it and is masked. Over a partial total the domain gives no share, and
// the card says why instead.
//
// Commissions over traded capital lead the strip, as in `atlas bucket`: with a
// small account and fixed fees, that ratio decides the result before the
// judgement does (rule 14). The rest of the panel is one tap away.

import { type JSX, Show } from "solid-js";
import { SeriesCard } from "../../components/chart/index.js";
import { Amount, Disclosure, Figure, Notice, StatLine, Tag } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { countOf } from "../../format/number.js";
import type { StatsView } from "../../view-models/bucket/index.js";

interface Plot {
  x: readonly number[];
  values: readonly (number | null)[][];
  rows: readonly { date: string; values: readonly (string | undefined)[] }[];
  missing?: string | undefined;
}

const Lead = (props: { view: StatsView }): JSX.Element => (
  <>
    <p class="hero-figure">
      <Figure value={props.view.vsIndexPct} unit="percent" decimals={1} signed coloured />
    </p>
    <p class="card-note">
      <Show
        when={props.view.vsIndexPct !== undefined}
        fallback={
          <Show
            when={props.view.vsIndexMissing > 0}
            fallback={<>Todavía no hay ninguna tesis que comparar con el índice.</>}
          >
            {countOf(props.view.vsIndexMissing, "tesis no se puede", "tesis no se pueden")} comparar
            con el índice: un porcentaje sobre un total parcial no diría nada.
          </Show>
        }
      >
        Lo que el cubo ha hecho de más o de menos que el mismo dinero en el índice, sobre lo
        aportado:{" "}
      </Show>
      <Show when={props.view.vsIndexTotal !== undefined}>
        <Amount value={props.view.vsIndexTotal} signed coloured />
        {props.view.vsIndexPct === undefined ? " en las tesis que sí se comparan." : "."}
      </Show>
    </p>
    <dl class="kpis">
      <div class="kpi">
        <dt>Comisiones s/ capital</dt>
        <dd>
          <Figure value={props.view.feesPct} unit="percent" decimals="auto" />
        </dd>
      </div>
      <div class="kpi">
        <dt>Tasa de acierto</dt>
        <dd>
          <Figure value={props.view.hitRatePct} unit="percent" decimals={0} />
        </dd>
      </div>
      <div class="kpi">
        <dt>Tesis cerradas</dt>
        <dd>{props.view.closedTheses}</dd>
      </div>
    </dl>
  </>
);

const Stats = (props: { view: StatsView }): JSX.Element => (
  <>
    <StatLine label="Comisiones sobre capital operado">
      <Figure value={props.view.feesPct} unit="percent" />
      <span class="meta">
        <Amount value={props.view.fees} /> de <Amount value={props.view.tradedCapital} />
      </span>
    </StatLine>
    <StatLine label="Ventas realizadas">{props.view.realizedOperations}</StatLine>
    <StatLine label="Ganancia media">
      <Amount value={props.view.averageWin} signed coloured />
    </StatLine>
    <StatLine label="Pérdida media">
      <Amount value={props.view.averageLoss} signed coloured />
    </StatLine>
    <StatLine label="Esperanza por tesis">
      <Amount value={props.view.expectancy} signed coloured />
    </StatLine>
    <StatLine label="Máxima caída">
      <Amount value={props.view.maxDrawdown} />
      <Show when={props.view.drawdownFrom !== undefined}>
        <span class="meta">
          del {formatDate(props.view.drawdownFrom ?? "")} al{" "}
          {formatDate(props.view.drawdownTo ?? "")}
        </span>
      </Show>
    </StatLine>
    <Show when={props.view.excluded.length > 0}>
      <p class="card-note">
        <Tag tone="caution">fuera de las medias</Tag> Las tesis {props.view.excluded.join("; ")}:
        sus ventas consumieron lotes comprados por otra tesis, porque el FIFO es global entre todas,
        así que su resultado no es solo suyo.
      </p>
    </Show>
  </>
);

export const StatsCard = (props: { view: StatsView; plot: Plot }): JSX.Element => (
  <SeriesCard
    title="Frente al índice"
    class="span-12"
    labels={["Resultado del cubo", "Equivalente en el índice"]}
    colours={["--c-series-bucket", "--c-series-index"]}
    dashes={[undefined, [6, 4]]}
    x={props.plot.x}
    values={props.plot.values}
    rows={props.plot.rows}
    missing={props.plot.missing}
    lead={<Lead view={props.view} />}
    empty={
      <Notice severity="info" title="Todavía no hay nada que dibujar">
        La comparación se dibuja sobre las fechas que tienen precio del índice y de los activos del
        cubo.
      </Notice>
    }
    tail={
      <Disclosure label="Ver todas las estadísticas">
        <Stats view={props.view} />
      </Disclosure>
    }
  />
);
