// "¿Estoy desviado?" — the class summary first, because that is the question,
// and the per-asset detail one tap away (docs/design/system.md §7.5).
//
// On a phone each asset class is a row in two lines: its weight, and under it
// the target and the deviation. From 1024px the same answer is a table. The
// bars above are the shape for the glance; the figures are for the decision.
//
// The mark of a deviation above the threshold is a **badge with a word in it** and, in the table of
// assets, the gauge whose dot turns to the colour of a warning — both from the warning the domain
// raised for that asset, never from comparing the figures here. The rule is per asset, so the gauge
// lives where the assets are.
//
// The transfer simulator folds at the foot of this card: it answers "how would these weights
// change", so it lives next to them.

import type { LedgerState, Settings } from "@atlas/domain";
import { For, type JSX, Show } from "solid-js";
import {
  Amount,
  type DataColumn,
  DataTable,
  Disclosure,
  Figure,
  Notice,
  Pending,
  Price,
  PriceDetail,
  PriceSource,
  Section,
  Tag,
} from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { pricesOf } from "../../format/messages/prose.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { type NameIndex, NO_NAMES } from "../../format/names.js";
import { formatDecimalString } from "../../format/number.js";
import { GRID, mediaQuery } from "../../shell/media.js";
import { privacy } from "../../shell/preferences.js";
import type { WeightRow, WeightsView } from "../../view-models/core/index.js";
import { ClassBullets } from "./ClassBullets.jsx";
import { ClassRows, ClassTable } from "./Classes.jsx";
import { Gauge } from "./Gauge.jsx";
import { TransferSimulator } from "./TransferSimulator.jsx";

const assetColumns = (threshold: string | undefined): readonly DataColumn<WeightRow>[] => [
  {
    key: "name",
    header: "Activo",
    card: "title",
    cell: (row) => row.name,
    hint: (row) => row.name,
  },
  {
    key: "quantity",
    header: "Cantidad",
    numeric: true,
    cell: (row) => <Amount quantity={row.quantity} of={row.units} />,
  },
  {
    key: "price",
    header: "Precio",
    numeric: true,
    card: "sub",
    cell: (row) => <Price price={row} marked />,
    cardCell: (row) => <PriceDetail price={row} withAge />,
  },
  {
    key: "source",
    header: "Origen",
    cell: (row) => <PriceSource price={row} />,
  },
  {
    key: "value",
    header: "Valor",
    numeric: true,
    card: "figure",
    // Nothing held is said in words: «0,00 €» beside prices that are missing
    // read as a zero value, not as no position.
    cell: (row) => (
      <Show when={!row.quantity.isZero()} fallback={<span class="meta">sin posición</span>}>
        <Amount value={row.value} missingReason="sin precio a esa fecha" />
      </Show>
    ),
  },
  {
    key: "weight",
    header: "Peso",
    numeric: true,
    cell: (row) => <Figure value={row.weightPct} unit="percent" />,
  },
  {
    key: "target",
    header: "Objetivo",
    numeric: true,
    cell: (row) => <Figure value={row.targetPct} unit="percent" decimals="auto" />,
  },
  {
    key: "deviation",
    header: "Desviación",
    numeric: true,
    card: "meta",
    cell: (row) => (
      <span class="dev-cell">
        <Gauge deviation={row.deviationPp} threshold={threshold} off={row.offTarget} />
        <Figure value={row.deviationPp} unit="points" />
      </span>
    ),
    cardCell: (row) => (
      <Show when={row.offTarget}>
        <Tag tone="caution" icon="caution">
          fuera de umbral
        </Tag>
      </Show>
    ),
  },
];

interface WeightsCardProps {
  view: WeightsView;
  /** `deviation_threshold_pp` in force, for the context of the title and the gauge. */
  threshold: string | undefined;
  state: LedgerState;
  date: string;
  settings: Settings;
  /** Funds a merger or a class change converted away: nothing of them to transfer. */
  absorbed: ReadonlySet<string>;
  /** The catalogue's names, for the notes of the automatic prices. */
  names?: NameIndex;
  /** The weighted TER of the priced core, from the costs (`costSummary`); absent without one. */
  weightedTer?: string | undefined;
}

export const WeightsCard = (props: WeightsCardProps): JSX.Element => {
  const wide = mediaQuery(GRID);
  const byClass = (): JSX.Element => (
    <>
      <ClassRows view={props.view} />
      <div class={props.view.partial ? "total-row" : "total-row only-narrow is-sm"}>
        <span class="label">Total de la cartera</span>
        <span class="value">
          <Amount value={props.view.total} missingReason="ninguna posición tiene precio" />
          <Show when={props.view.partial}>
            <Tag icon="half" title={`Faltan: ${props.view.missing.join(", ")}`}>
              parcial
            </Tag>
          </Show>
        </span>
      </div>
    </>
  );
  return (
    <Section title="Pesos frente al objetivo" class="cartera-weights">
      <Show
        when={props.view.classes.length > 0}
        fallback={<p class="meta">Todavía no hay nada en la cartera principal.</p>}
      >
        <dl class="kpis is-lead">
          <div class="kpi">
            <dt>{wide() ? "Cartera principal" : "Cartera"}</dt>
            <dd class="kpi-lead">
              <Amount value={props.view.total} decimals={0} missingReason="sin precio" />
              <Show when={props.view.partial}>
                <Tag icon="half" title={`Faltan: ${props.view.missing.join(", ")}`}>
                  parcial
                </Tag>
              </Show>
            </dd>
          </div>
          <Show when={props.threshold}>
            {(threshold) => (
              <div class="kpi">
                <dt>Umbral</dt>
                <dd class="kpi-lead">±{formatDecimalString(threshold())} pp</dd>
              </div>
            )}
          </Show>
          <Show when={props.weightedTer}>
            {(ter) => (
              <div class="kpi">
                <dt>{wide() ? "TER medio" : "TER"}</dt>
                <dd class="kpi-lead">
                  <Figure value={ter()} unit="percent" decimals={2} />
                </dd>
              </div>
            )}
          </Show>
        </dl>
        <Show when={!props.view.partial}>
          <ClassBullets view={props.view} threshold={props.threshold} />
        </Show>

        <For each={props.view.priceNotes}>
          {(warning) => (
            <Notice severity="caution">
              {describeWarning(warning, { names: props.names ?? NO_NAMES, privacy: privacy() })}
            </Notice>
          )}
        </For>
        <Show when={props.view.partial && props.view.missing.length > 0}>
          <Pending action={{ label: "Registrar valoraciones", to: "/registrar/valuation" }}>
            {pricesOf(props.view.missing)} a {formatDate(props.view.date)}: los pesos no se calculan
            sobre un total parcial.
          </Pending>
        </Show>

        {/* The bars already say it on a phone; without them, the rows are all there is. */}
        <Show
          when={wide() || props.view.partial}
          fallback={<Disclosure label="Valor y desviación por tipo">{byClass()}</Disclosure>}
        >
          {byClass()}
        </Show>
        <Show when={!props.view.partial}>
          <ClassTable view={props.view} />
        </Show>
      </Show>

      <Disclosure label="Ver activo por activo">
        <DataTable
          label="Pesos por activo"
          size="lg"
          columns={assetColumns(props.threshold)}
          rows={props.view.classes.flatMap((row) => row.rows)}
        />
      </Disclosure>
      <Disclosure label="Simular un traspaso entre fondos">
        <TransferSimulator
          state={props.state}
          date={props.date}
          settings={props.settings}
          absorbed={props.absorbed}
        />
      </Disclosure>
    </Section>
  );
};
