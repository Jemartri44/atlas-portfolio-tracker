// "¿Gané más que la alternativa aburrida?" — the reference is the index, not
// zero.
//
// The figure comes from `bucketTheses` and is not recomputed here. Where the
// comparison is missing, the cell says **sin dato** and the row says why: a
// column of dashes is not an explanation.

import { For, type JSX, Show } from "solid-js";
import {
  Amount,
  type DataColumn,
  DataTable,
  Disclosure,
  Figure,
  FoldSection,
  type NoticeItem,
  NoticeList,
  StatLine,
  Tag,
} from "../../components/index.js";
import { countOf } from "../../format/number.js";
import type { ThesesView, ThesisRow } from "../../view-models/bucket/index.js";
import { Dumbbells } from "./Dumbbells.jsx";

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
    amount: "lead",
    cell: (row) => <Amount value={row.invested} />,
  },
  {
    key: "result",
    header: "Resultado",
    numeric: true,
    amount: true,
    cell: (row) => <Amount value={row.result} signed coloured />,
  },
  {
    key: "latent",
    header: "Latente",
    numeric: true,
    amount: true,
    cell: (row) => (
      <Amount value={row.unrealized} signed coloured missingReason="falta el precio del activo" />
    ),
  },
  {
    key: "vs",
    header: "Frente al índice",
    numeric: true,
    card: "figure",
    amount: true,
    cell: (row) => <Amount value={row.vsIndex} signed coloured missingReason={row.gap} />,
  },
  // With the amounts hidden, what stands for them: the same two results in
  // percent over what was invested, and the difference in points.
  {
    key: "thesis-pct",
    header: "Resultado s/ invertido",
    numeric: true,
    whenMasked: true,
    cell: (row) => <Figure value={row.thesisPct} unit="percent" decimals={1} signed coloured />,
  },
  {
    key: "vs-pp",
    header: "Frente al índice (pp)",
    numeric: true,
    card: "figure",
    whenMasked: true,
    cell: (row) => <Figure value={row.vsIndexPp} unit="points" />,
  },
];

/** The rows by whether the thesis is still open. */
const byState = (rows: readonly ThesisRow[], open: boolean): ThesisRow[] =>
  rows.filter((row) => row.open === open);

/** What the folded card says: how many of each, and that there is something to read inside. */
const folded = (rows: readonly ThesisRow[], untagged: number, notices: number): string => {
  const open = byState(rows, true).length;
  const closed = rows.length - open;
  const said = [
    ...(rows.length === 0 ? [] : [countOf(open, "abierta", "abiertas")]),
    ...(rows.length === 0 ? [] : [countOf(closed, "cerrada", "cerradas")]),
    ...(untagged === 0 ? [] : [`${untagged} sin tesis`]),
    ...(notices === 0 ? [] : [countOf(notices, "aviso", "avisos")]),
  ];
  return rows.length === 0 && untagged === 0 ? "Todavía ninguna" : said.join(" · ");
};

/** An open thesis in a line: against the index, in points, or why there is no figure. */
const Line = (props: { row: ThesisRow }): JSX.Element => (
  <StatLine label={`${props.row.assetName} · ${props.row.period}`}>
    <Show when={props.row.vsIndexPp !== undefined} fallback={<span class="nodata">sin dato</span>}>
      <Figure value={props.row.vsIndexPp} unit="points" />
    </Show>
  </StatLine>
);

export const ThesesCard = (props: {
  view: ThesesView;
  /** What the theses warn of that no row says: no index set, a thesis closed still holding. */
  notices?: readonly NoticeItem[];
}): JSX.Element => {
  const open = () => byState(props.view.rows, true);
  const closed = () => byState(props.view.rows, false);
  return (
    <FoldSection
      title="Tesis frente al índice"
      summary={folded(props.view.rows, props.view.untagged.length, (props.notices ?? []).length)}
      aside={<span>la vara de medir es el índice, no el cero</span>}
    >
      <Show when={(props.notices ?? []).length > 0}>
        <NoticeList items={props.notices ?? []} label="Avisos de las tesis" />
      </Show>
      <Show
        when={props.view.rows.length > 0}
        fallback={
          <Show when={props.view.untagged.length === 0}>
            <p class="meta">Todavía no hay ninguna tesis.</p>
          </Show>
        }
      >
        {/* The open ones in a line; the table and the closed ones, which are history, fold. */}
        <For each={open()}>{(row) => <Line row={row} />}</For>
        <Show when={open().length > 0}>
          <Disclosure label={`${countOf(open().length, "tesis", "tesis")} en tabla`}>
            <Dumbbells rows={open()} label="Tesis abiertas frente al índice, en puntos" />
            <DataTable
              label="Tesis abiertas"
              columns={COLUMNS}
              rows={open()}
              size="lg"
              maskedMerge
            />
          </Disclosure>
        </Show>
        <Show when={closed().length > 0}>
          <Disclosure
            label={countOf(closed().length, "tesis cerrada", "tesis cerradas")}
            open={open().length === 0}
          >
            <Dumbbells rows={closed()} label="Tesis cerradas frente al índice, en puntos" />
            <DataTable
              label="Tesis cerradas"
              columns={COLUMNS}
              rows={closed()}
              size="lg"
              maskedMerge
            />
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
      <Show when={props.view.untagged.length > 0}>
        <For each={props.view.untagged}>{(row) => <Line row={row} />}</For>
        <Disclosure
          label={`${countOf(props.view.untagged.length, "operación", "operaciones")} sin tesis, en tabla`}
        >
          <DataTable
            label="Operaciones sin tesis"
            columns={COLUMNS}
            rows={props.view.untagged}
            size="lg"
            maskedMerge
          />
        </Disclosure>
      </Show>
    </FoldSection>
  );
};
