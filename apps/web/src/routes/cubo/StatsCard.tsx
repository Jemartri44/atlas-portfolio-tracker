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
// Commissions over traded capital lead the strip: with a
// small account and fixed fees, that ratio decides the result before the
// judgement does (rule 14). The rest of the panel is one tap away.

import { type JSX, Show } from "solid-js";
import { SeriesCard } from "../../components/chart/index.js";
import {
  Amount,
  Disclosure,
  Figure,
  Notice,
  Pending,
  StatLine,
  Tag,
} from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { GRID, mediaQuery } from "../../shell/media.js";
import type { StatsView } from "../../view-models/bucket/index.js";
import type { MissingNote, PlottedSeries } from "../../view-models/series.js";

interface Plot {
  x: readonly number[];
  values: readonly (number | null)[][];
  rows: readonly { date: string; values: readonly (string | undefined)[] }[];
  missing?: MissingNote | undefined;
  idle?: PlottedSeries["idle"] | undefined;
}

/** The real reason there is nothing to compare, when it is not a missing price. */
const IDLE: Record<
  NonNullable<PlottedSeries["idle"]>,
  { text: string; action: { label: string; to: string } }
> = {
  no_investments: {
    text: "Sin inversiones en el cubo. La comparación con el índice empieza con la primera compra.",
    action: { label: "Abrir una tesis", to: "/registrar/tesis" },
  },
  no_contributions: {
    text: "El cubo tiene compras y ningún ingreso registrado en su cuenta: sin lo aportado no hay porcentaje que dibujar.",
    action: { label: "Registrar un ingreso", to: "/registrar/cash-in" },
  },
};

/** Why there is no percentage yet, said once, with the way to get it. */
const NotYet = (props: { view: StatsView; idle: Plot["idle"] }): JSX.Element => (
  <Show
    when={props.idle === undefined}
    fallback={
      <Pending action={IDLE[props.idle as NonNullable<Plot["idle"]>].action}>
        {IDLE[props.idle as NonNullable<Plot["idle"]>].text}
      </Pending>
    }
  >
    <NotYetPrices view={props.view} />
  </Show>
);

const NotYetPrices = (props: { view: StatsView }): JSX.Element => {
  const wide = mediaQuery(GRID);
  return (
    <Show
      when={props.view.vsIndexMissing > 0}
      fallback={
        <Pending action={{ label: "Abrir una tesis", to: "/registrar/tesis" }}>
          El resultado frente al índice llega con la primera tesis que se pueda comparar.
        </Pending>
      }
    >
      <Show
        when={wide()}
        fallback={
          <Pending line>
            Falta el precio del índice en{" "}
            {props.view.vsIndexMissing === 1 ? "una tesis" : `${props.view.vsIndexMissing} tesis`}.
            <Show when={props.view.vsIndexTotal !== undefined}>
              {" "}
              Comparables: <Amount value={props.view.vsIndexTotal} signed coloured />
            </Show>
          </Pending>
        }
      >
        <Pending action={{ label: "Registrar valoraciones", to: "/registrar/valuation" }}>
          Llega cuando todas las tesis se puedan comparar:{" "}
          {props.view.vsIndexMissing === 1
            ? "a una tesis le falta"
            : `a ${props.view.vsIndexMissing} tesis les falta`}{" "}
          el precio del índice en sus fechas.
          <Show when={props.view.vsIndexTotal !== undefined}>
            {" "}
            En las que sí se comparan: <Amount value={props.view.vsIndexTotal} signed coloured />.
          </Show>
        </Pending>
      </Show>
    </Show>
  );
};

const Lead = (props: { view: StatsView; idle: Plot["idle"] }): JSX.Element => {
  const wide = mediaQuery(GRID);
  return (
    <>
      <Show
        when={props.view.vsIndexPct !== undefined}
        fallback={<NotYet view={props.view} idle={props.idle} />}
      >
        <p class="hero-figure">
          <Figure value={props.view.vsIndexPct} unit="percent" decimals={1} signed coloured />
        </p>
        <p class="card-note">
          Lo que el cubo ha hecho de más o de menos que el mismo dinero en el índice, sobre lo
          aportado: <Amount value={props.view.vsIndexTotal} signed coloured />.
        </p>
      </Show>
      <Show when={!wide()}>
        <dl class="kpis">
          <div class="kpi">
            <dt>Comisiones</dt>
            <dd>
              <Figure value={props.view.feesPct} unit="percent" decimals="auto" />
            </dd>
          </div>
          <div class="kpi">
            <dt>Acierto</dt>
            <dd>
              <Figure value={props.view.hitRatePct} unit="percent" decimals={0} />
            </dd>
          </div>
          <div class="kpi">
            <dt>Cerradas</dt>
            <dd>{props.view.closedTheses}</dd>
          </div>
        </dl>
      </Show>
    </>
  );
};

/** The three figures of the strip, beside the chart on a computer. */
const Side = (props: { view: StatsView }): JSX.Element => (
  <div>
    <StatLine label="Comisiones s/ capital">
      <Figure value={props.view.feesPct} unit="percent" decimals="auto" />
    </StatLine>
    <StatLine label="Tasa de acierto">
      <Figure value={props.view.hitRatePct} unit="percent" decimals={0} />
    </StatLine>
    <StatLine label="Tesis cerradas">{props.view.closedTheses}</StatLine>
  </div>
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

export const StatsCard = (props: { view: StatsView; plot: Plot; asOf: string }): JSX.Element => {
  const wide = mediaQuery(GRID);
  return (
    <SeriesCard
      title="Frente al índice"
      asOf={props.asOf}
      class="span-12"
      unit="pct"
      jump
      labels={["Resultado del cubo", "Equivalente en el índice"]}
      colours={["--c-series-bucket", "--c-series-index"]}
      dashes={[undefined, [6, 4]]}
      x={props.plot.x}
      values={props.plot.values}
      rows={props.plot.rows}
      missing={props.plot.missing}
      lead={<Lead view={props.view} idle={props.plot.idle} />}
      side={wide() ? <Side view={props.view} /> : undefined}
      phone={{ title: "Frente al índice", fold: "Leyenda, huecos y estadísticas" }}
      foot={wide() ? undefined : <Stats view={props.view} />}
      empty={
        // With a reason of its own the lead already says it: not twice.
        <Show when={props.plot.idle === undefined}>
          <Notice severity="info" title="Todavía no hay nada que dibujar">
            La comparación se dibuja sobre las fechas que tienen precio del índice y de los activos
            del cubo.
          </Notice>
        </Show>
      }
      tail={
        <Show when={wide()}>
          <Disclosure label="Ver todas las estadísticas">
            <Stats view={props.view} />
          </Disclosure>
        </Show>
      }
    />
  );
};
