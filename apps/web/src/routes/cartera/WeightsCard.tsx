// "¿Estoy desviado?" — the class summary first, because that is the question,
// and the per-asset detail one tap away (docs/design/system.md §7.5).
//
// On a phone each asset class is a row in two lines: its weight, and under it
// the target and the deviation. From 1024px the same answer is a table. The
// bars above are the shape for the glance; the figures are for the decision.
//
// The mark of a deviation above the threshold is a **badge with a word in it**
// and, in the table of assets, the gauge (D7) whose dot turns to the colour of
// a warning — both from the warning the domain raised for that asset, never
// from comparing the figures here (decision (c)). The rule is per asset, so
// the gauge lives where the assets are.
//
// The transfer simulator folds at the foot of this card (D6): it answers "how
// would these weights change", so it lives next to them.

import type { LedgerState, Settings } from "@atlas/domain";
import { type JSX, Show } from "solid-js";
import { Allocation, type AllocationSegment } from "../../components/chart/index.js";
import {
  Amount,
  type DataColumn,
  DataTable,
  Disclosure,
  Figure,
  Pending,
  Price,
  PriceDetail,
  Section,
  Tag,
} from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { formatDecimalString } from "../../format/number.js";
import type { WeightRow, WeightsView } from "../../view-models/core/index.js";
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
    cell: (row) => <Price price={row} />,
    cardCell: (row) => <PriceDetail price={row} withAge />,
  },
  {
    key: "value",
    header: "Valor",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.value} missingReason="sin precio a esa fecha" />,
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
}

export const WeightsCard = (props: WeightsCardProps): JSX.Element => {
  const segments = (): AllocationSegment[] =>
    props.view.classes.map((row) => ({
      key: row.assetClass,
      label: row.label,
      actualPct: row.weightPct,
      targetPct: row.targetPct,
    }));

  return (
    <Section
      title="Pesos frente al objetivo"
      class="span-7 is-natural"
      aside={
        <Show when={props.threshold}>
          {(threshold) => <span>umbral ±{formatDecimalString(threshold())} pp</span>}
        </Show>
      }
    >
      <Show
        when={props.view.classes.length > 0}
        fallback={<p class="meta">Todavía no hay nada en la cartera principal.</p>}
      >
        <Allocation segments={segments()} />

        <Show when={props.view.partial}>
          <Pending action={{ label: "Registrar valoraciones", to: "/registrar/valuation" }}>
            Faltan precios de {props.view.missing.join(", ")} a {formatDate(props.view.date)}: los
            pesos no se calculan sobre un total parcial.
          </Pending>
        </Show>

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
