// "¿Gané más que la alternativa aburrida?" — the reference is the index, not
// zero.
//
// The figure comes from `bucketTheses` and is not recomputed here. Where the
// comparison is missing, the cell says **sin dato** and the row says why: a
// column of dashes is not an explanation.

import { type JSX, Show } from "solid-js";
import {
  Amount,
  type DataColumn,
  DataTable,
  Disclosure,
  type NoticeItem,
  NoticeList,
  Section,
  Tag,
} from "../../components/index.js";
import { countOf } from "../../format/number.js";
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

/** The rows by whether the thesis is still open. */
const byState = (rows: readonly ThesisRow[], open: boolean): ThesisRow[] =>
  rows.filter((row) => row.open === open);

export const ThesesCard = (props: {
  view: ThesesView;
  /** What the theses warn of that no row says: no index set, a thesis closed still holding. */
  notices?: readonly NoticeItem[];
}): JSX.Element => {
  const open = () => byState(props.view.rows, true);
  const closed = () => byState(props.view.rows, false);
  return (
    <Section
      title="Tesis frente al índice"
      class="span-12"
      aside={<span>la vara de medir es el índice, no el cero</span>}
    >
      <Show when={(props.notices ?? []).length > 0}>
        <NoticeList items={props.notices ?? []} label="Avisos de las tesis" />
      </Show>
      <Show
        when={props.view.rows.length > 0}
        fallback={<p class="meta">Todavía no hay ninguna tesis.</p>}
      >
        {/*
        The open theses in sight, the closed ones folded when there are open
        ones: they are history, their sum against the index heads the screen,
        and on a phone they were most of its four screens (third pass).
      */}
        <Show
          when={open().length > 0 && closed().length > 0}
          fallback={
            <DataTable label="Tesis del cubo" columns={COLUMNS} rows={props.view.rows} size="lg" />
          }
        >
          <DataTable label="Tesis abiertas" columns={COLUMNS} rows={open()} size="lg" />
          <Disclosure label={countOf(closed().length, "tesis cerrada", "tesis cerradas")}>
            <DataTable label="Tesis cerradas" columns={COLUMNS} rows={closed()} size="lg" />
          </Disclosure>
        </Show>
        <Show when={props.view.withoutIndex > 0}>
          <p class="card-note">
            {props.view.withoutIndex}{" "}
            {props.view.withoutIndex === 1
              ? "tesis no se puede comparar"
              : "tesis no se pueden comparar"}{" "}
            con el índice. El motivo está en la propia fila: nunca se estima.
          </p>
        </Show>
      </Show>
    </Section>
  );
};
