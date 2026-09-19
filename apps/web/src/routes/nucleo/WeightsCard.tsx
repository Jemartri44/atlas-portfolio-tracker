// "¿Estoy desviado?" — the class summary first, because that is the question,
// and the per-asset detail one tap away.
//
// The mark of a deviation above the threshold is a **badge with a word in it**,
// not a colour: a screenshot in black and white has to say the same thing
// (decision (f) of the 006).

import { For, type JSX, Show } from "solid-js";
import { Allocation, type AllocationSegment } from "../../components/chart/index.js";
import {
  Amount,
  type DataColumn,
  DataTable,
  Disclosure,
  Figure,
  Price,
  PriceDetail,
  Section,
  Tag,
} from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import type { WeightClassRow, WeightRow, WeightsView } from "../../view-models/core/index.js";

const ASSET_COLUMNS: readonly DataColumn<WeightRow>[] = [
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
    cell: (row) => <Amount quantity={row.quantity} />,
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
    cell: (row) => <Figure value={row.targetPct} unit="percent" />,
  },
  {
    key: "deviation",
    header: "Desviación",
    numeric: true,
    card: "meta",
    cell: (row) => (
      <>
        <Figure value={row.deviationPp} unit="points" coloured />
        <Show when={row.offTarget}>
          {" "}
          <Tag tone="caution">fuera de umbral</Tag>
        </Show>
      </>
    ),
    cardCell: (row) => (
      <Show when={row.offTarget}>
        <Tag tone="caution">fuera de umbral</Tag>
      </Show>
    ),
  },
];

const ClassLine = (props: { row: WeightClassRow }): JSX.Element => (
  <div class="weight-line">
    <span class="subject">
      <span class={`swatch is-class-${props.row.assetClass}`} /> {props.row.label}
      <Show when={props.row.belowMinimum}>
        {" "}
        <Tag tone="caution">bajo el mínimo</Tag>
      </Show>
      <Show when={props.row.partial}>
        {" "}
        <Tag tone="caution">parcial</Tag>
      </Show>
    </span>
    <Figure value={props.row.weightPct} unit="percent" class="weight" />
    <Figure value={props.row.targetPct} unit="percent" class="target" />
    <Figure value={props.row.deviationPp} unit="points" coloured class="deviation" />
  </div>
);

export const WeightsCard = (props: { view: WeightsView }): JSX.Element => {
  const segments = (): AllocationSegment[] =>
    props.view.classes.map((row) => ({
      key: row.assetClass,
      label: row.label,
      actualPct: row.weightPct,
      targetPct: row.targetPct,
    }));

  return (
    <Section
      title="Pesos y desviaciones"
      aside={<span class="tiny">peso · objetivo · desviación</span>}
    >
      <Show
        when={props.view.classes.length > 0}
        fallback={<p class="subtle flush">Todavía no hay nada en el núcleo.</p>}
      >
        {/*
        The bar and the table are the same answer twice: the shape for the
        glance, the figures for the decision. They live in one card because as
        two they printed peso and objetivo twice, which reads as a mistake.
      */}
        <Allocation segments={segments()} />

        <div class="weights">
          <For each={props.view.classes}>{(row) => <ClassLine row={row} />}</For>
        </div>

        <div class="spread total-line">
          <span class="subject">Total del núcleo</span>
          <span class="hstack">
            <Amount value={props.view.total} missingReason="ninguna posición tiene precio" />
            <Show when={props.view.partial}>
              <Tag tone="caution" title={`Faltan: ${props.view.missing.join(", ")}`}>
                parcial
              </Tag>
            </Show>
          </span>
        </div>

        <Show when={props.view.partial}>
          <p class="note">
            Faltan precios de {props.view.missing.join(", ")} a {formatDate(props.view.date)}: los
            pesos no se calculan sobre un total parcial.
          </p>
        </Show>

        <Disclosure label="Ver activo por activo">
          <DataTable
            label="Pesos por activo"
            columns={ASSET_COLUMNS}
            rows={props.view.classes.flatMap((row) => row.rows)}
          />
        </Disclosure>
      </Show>
    </Section>
  );
};
