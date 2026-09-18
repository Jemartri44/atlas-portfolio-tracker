// "¿Qué tengo abierto?" — every live position of the bucket with its latent
// gain, its weight **inside the bucket** and the thesis it belongs to.
//
// The invalidation condition is shown in full, never truncated to a tooltip: a
// condition written once and never read again is worth nothing (rule 15).

import { type JSX, Show } from "solid-js";
import {
  Amount,
  Badge,
  type DataColumn,
  DataTable,
  Figure,
  Price,
  PriceDetail,
  Section,
} from "../../components/index.js";
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
    cell: (row) => <Amount quantity={row.quantity} />,
  },
  {
    key: "cost",
    header: "Coste medio",
    numeric: true,
    cell: (row) => <Amount value={row.unitCost} unit currency={false} />,
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
    key: "value",
    header: "Valor",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.value} missingReason="sin precio a esa fecha" />,
  },
  {
    key: "pl",
    header: "P&L latente",
    numeric: true,
    card: "meta",
    cell: (row) => <Amount value={row.unrealized} signed coloured currency={false} />,
    // One "sin dato", not two: a row with no price used to read
    // "Alpha Spin-off · sin dato · sin dato … sin dato" (seen in a screenshot).
    cardCell: (row) => (
      <Show
        when={row.unrealized !== undefined}
        fallback={<Amount value={undefined} missingReason="sin precio a esa fecha" />}
      >
        <span class="row">
          <Amount value={row.unrealized} signed coloured currency={false} />
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
];

/**
 * The thesis of a position, **with** the position and not in a list at the
 * bottom of the card: on a phone the two read as unrelated blocks otherwise,
 * and the invalidation condition is the thing rule 15 wants in front of the
 * eyes every time the position is looked at.
 */
const ThesisNote = (props: { row: BucketPositionRow }): JSX.Element => (
  <Show when={props.row.thesisId !== undefined}>
    <span class="row wrap">
      <Badge>{props.row.thesisId}</Badge>
      <span class="tiny">
        {props.row.daysOpen} de {props.row.horizonDays} días
      </span>
      <Show when={props.row.horizonExceeded}>
        <Badge tone="warning">plazo superado</Badge>
      </Show>
    </span>
    <Show when={props.row.invalidation !== undefined}>
      <p class="note flush">
        <strong>Me equivoco si:</strong> {props.row.invalidation}
      </p>
    </Show>
  </Show>
);

export const PositionsCard = (props: { view: BucketPositionsView }): JSX.Element => (
  <Section title="Posiciones abiertas">
    <Show
      when={props.view.rows.length > 0}
      fallback={<p class="subtle flush">No hay ninguna posición abierta en el cubo.</p>}
    >
      <DataTable
        label="Posiciones del cubo"
        columns={COLUMNS}
        rows={props.view.rows}
        detail={(row) => <ThesisNote row={row} />}
      />
      <div class="spread total-line">
        <span class="subject">
          Total del cubo
          <Show when={props.view.partial}>
            {" "}
            <Badge tone="warning" title={`Faltan: ${props.view.missing.join(", ")}`}>
              parcial
            </Badge>
          </Show>
        </span>
        <span class="row">
          <Amount value={props.view.totalValue} missingReason="ninguna posición tiene precio" />
          <span class="tiny">
            coste <Amount value={props.view.totalCost} currency={false} />
          </span>
        </span>
      </div>
      <Show when={props.view.partial}>
        <p class="note">
          Faltan precios de {props.view.missing.join(", ")}: el total solo cubre lo que sí tiene
          precio, y los pesos dentro del cubo no se calculan sobre un total parcial.
        </p>
      </Show>
    </Show>
  </Section>
);
