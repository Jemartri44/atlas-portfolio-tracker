// "¿Qué tengo abierto?" — every live position of the bucket with its latent
// gain, its weight **inside the bucket** and the thesis it belongs to.
//
// The invalidation condition is shown in full, never truncated to a tooltip: a
// condition written once and never read again is worth nothing (rule 15).

import { For, type JSX, Show } from "solid-js";
import {
  Amount,
  type DataColumn,
  DataTable,
  Disclosure,
  Figure,
  Pending,
  Price,
  PriceDetail,
  PriceSource,
  Section,
  Tag,
  TotalLine,
} from "../../components/index.js";
import { pricesOf } from "../../format/messages/prose.js";
import { GRID, mediaQuery } from "../../shell/media.js";
import type { BucketPositionRow, BucketPositionsView } from "../../view-models/bucket/index.js";

const COLUMNS: readonly DataColumn<BucketPositionRow>[] = [
  {
    key: "name",
    header: "Activo",
    card: "title",
    cell: (row) => row.name,
    hint: (row) => `${row.name} · ${row.accountName}`,
  },
  {
    key: "quantity",
    header: "Cantidad",
    numeric: true,
    amount: true,
    cell: (row) => <Amount quantity={row.quantity} of={row.units} />,
  },
  {
    key: "cost",
    header: "Coste medio",
    numeric: true,
    amount: true,
    cell: (row) => <Amount value={row.unitCost} unit />,
  },
  {
    key: "price",
    header: "Precio",
    numeric: true,
    card: "sub",
    cell: (row) => <Price price={row} />,
    cardCell: (row) => <PriceDetail price={row} />,
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
    amount: "lead",
    cell: (row) => <Amount value={row.value} missingReason="sin precio a esa fecha" />,
  },
  {
    key: "pl",
    header: "Resultado latente",
    numeric: true,
    card: "meta",
    amount: true,
    cell: (row) => <Amount value={row.unrealized} signed coloured />,
    // Said once: with no price the line above already reads «sin precio» and
    // the figure «sin dato»; a third one here read «sin precio sin dato».
    cardCell: (row) => (
      <Show when={row.unrealized !== undefined}>
        <span class="figure-pair">
          <Amount value={row.unrealized} signed coloured />
          <Figure value={row.unrealizedPct} unit="percent" coloured />
        </span>
      </Show>
    ),
  },
  {
    key: "weight",
    header: "Peso en el cubo",
    numeric: true,
    cell: (row) => <Figure value={row.weightPct} unit="percent" />,
  },
  // With the amounts hidden, the latent result as a percentage of the cost.
  {
    key: "pl-pct",
    header: "Latente s/ coste",
    numeric: true,
    whenMasked: true,
    cell: (row) => <Figure value={row.unrealizedPct} unit="percent" decimals={1} signed coloured />,
  },
];

/**
 * The thesis of a position, **with** the position and not in a list at the
 * bottom of the card: on a phone the two read as unrelated blocks otherwise,
 * and the invalidation condition is the thing rule 15 wants in front of the
 * eyes every time the position is looked at.
 */
const ThesisNote = (props: { row: BucketPositionRow }): JSX.Element => (
  <Show when={props.row.thesisId !== undefined}>
    <span class="thesis-line">
      <Tag icon="flask">tesis abierta</Tag>
      <span class="meta">
        {props.row.daysOpen} de {props.row.horizonDays} días
      </span>
      <Show when={props.row.horizonExceeded}>
        <Tag tone="caution" icon="clock">
          plazo superado
        </Tag>
      </Show>
    </span>
    <Show when={props.row.invalidation !== undefined}>
      <span class="thesis-text">
        <strong>Me equivoco si:</strong> {props.row.invalidation}
      </span>
    </Show>
  </Show>
);

/** A position in a line, on a phone: what it is worth and how it goes. The rest folds. */
const Line = (props: { row: BucketPositionRow }): JSX.Element => (
  <li>
    <div class="row">
      <span class="main">
        <span class="title truncate" title={props.row.name}>
          {props.row.name}
        </span>
      </span>
      <span class="split-figs">
        <Amount value={props.row.value} missingReason="sin precio a esa fecha" class="fig" />
        <Show when={props.row.unrealizedPct !== undefined}>
          {" "}
          <Figure value={props.row.unrealizedPct} unit="percent" signed coloured />
        </Show>
      </span>
    </div>
  </li>
);

export const PositionsCard = (props: { view: BucketPositionsView }): JSX.Element => {
  const wide = mediaQuery(GRID);
  const table = (): JSX.Element => (
    <DataTable
      label="Posiciones del cubo"
      size="lg"
      columns={COLUMNS}
      rows={props.view.rows}
      maskedMerge
      detail={(row) => <ThesisNote row={row} />}
    />
  );
  return (
    <Section title="Posiciones abiertas">
      <Show
        when={props.view.rows.length > 0}
        fallback={<p class="meta">No hay ninguna posición abierta en el cubo.</p>}
      >
        <Show
          when={wide()}
          fallback={
            <ul class="rows" aria-label="Posiciones del cubo, en una línea">
              <For each={props.view.rows}>{(row) => <Line row={row} />}</For>
            </ul>
          }
        >
          {table()}
        </Show>
        <TotalLine
          label={
            <>
              Total del cubo
              <Show when={props.view.partial}>
                {" "}
                <Tag icon="half" title={`Faltan: ${props.view.missing.join(", ")}`}>
                  parcial
                </Tag>
              </Show>
            </>
          }
        >
          <Amount value={props.view.totalValue} missingReason="ninguna posición tiene precio" />
          <span class="meta">
            coste <Amount value={props.view.totalCost} />
          </span>
        </TotalLine>
        <Show when={props.view.partial}>
          <Show
            when={wide()}
            fallback={
              <Pending line action={{ label: "Registrar", to: "/registrar/valuation" }}>
                {pricesOf(props.view.missing)}.
              </Pending>
            }
          >
            <Pending action={{ label: "Registrar valoraciones", to: "/registrar/valuation" }}>
              {pricesOf(props.view.missing)}: el total solo cubre lo que sí tiene precio, y los
              pesos dentro del cubo no se calculan sobre un total parcial.
            </Pending>
          </Show>
        </Show>
        <Show when={!wide()}>
          <Disclosure label="Tesis y detalle de cada posición">{table()}</Disclosure>
        </Show>
      </Show>
    </Section>
  );
};
