// "¿Gané más que la alternativa aburrida?" — rule 16: the reference is the
// index, not zero.
//
// The figure comes from `bucketTheses` and is not recomputed here. Where the
// comparison is missing, the cell says **sin dato** and the row says why: a
// column of dashes is not an explanation.

import { type JSX, Show } from "solid-js";
import { Amount, type DataColumn, DataTable, Section, Tag } from "../../components/index.js";
import type { ThesesView, ThesisRow } from "../../view-models/bucket/index.js";

const COLUMNS: readonly DataColumn<ThesisRow>[] = [
  {
    key: "asset",
    header: "Activo",
    card: "title",
    cell: (row) => row.assetName,
    hint: (row) => `${row.assetName} · ${row.accountName}`,
  },
  { key: "period", header: "Tesis", card: "sub", cell: (row) => row.period },
  {
    key: "status",
    header: "Estado",
    card: "meta",
    cell: (row) => (
      <>
        <Tag tone={row.open ? "accent" : undefined}>{row.status}</Tag>
        <Show when={row.horizonExceeded && row.open}>
          {" "}
          <Tag tone="caution" icon="clock">
            plazo superado
          </Tag>
        </Show>
      </>
    ),
  },
  {
    key: "invested",
    header: "Invertido",
    numeric: true,
    cell: (row) => <Amount value={row.invested} />,
  },
  {
    key: "result",
    header: "Resultado",
    numeric: true,
    cell: (row) => <Amount value={row.result} signed coloured />,
  },
  {
    key: "latent",
    header: "Latente",
    numeric: true,
    cell: (row) => (
      <Amount value={row.unrealized} signed coloured missingReason="falta el precio del activo" />
    ),
  },
  {
    key: "vs",
    header: "Frente al índice",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.vsIndex} signed coloured missingReason={row.gap} />,
  },
];

export const ThesesCard = (props: { view: ThesesView }): JSX.Element => (
  <Section
    title="Tesis frente al índice"
    class="span-12"
    aside={<span>la vara de medir es el índice, no el cero</span>}
  >
    <Show
      when={props.view.rows.length > 0}
      fallback={<p class="meta">Todavía no hay ninguna tesis.</p>}
    >
      <DataTable label="Tesis del cubo" columns={COLUMNS} rows={props.view.rows} size="lg" />
      <Show when={props.view.withoutIndex > 0}>
        <p class="card-note">
          {props.view.withoutIndex}{" "}
          {props.view.withoutIndex === 1
            ? "tesis no se puede comparar"
            : "tesis no se pueden comparar"}{" "}
          con el índice. El motivo está en la propia fila y en los avisos: nunca se estima.
        </p>
      </Show>
    </Show>
  </Section>
);
