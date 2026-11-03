// «¿Cómo va?» — what the core has earned on the money put into it: «he aportado X, vale Y, he
// ganado Z %», the money-weighted annual rate and the real one (discounting the CPI), and the same
// by asset class. Core only: the bucket never takes part. Everything comes from the domain
// (`coreXirr`, `classReturns`); a figure whose data is missing is not shown, the sentence says what
// is missing. The percentages stay in sight with the privacy mode on; the amounts are masked.

import { For, type JSX, Show } from "solid-js";
import {
  Amount,
  type DataColumn,
  DataTable,
  Figure,
  Notice,
  Section,
  StatLine,
} from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import type { ClassReturnRowView, ReturnsView } from "../../view-models/core/returns.js";

const COLUMNS: readonly DataColumn<ClassReturnRowView>[] = [
  { key: "class", header: "Tipo de activo", card: "title", cell: (row) => row.label },
  {
    key: "invested",
    header: "Aportado",
    numeric: true,
    amount: true,
    cell: (row) => <Amount value={row.invested} missingReason="sin dato" />,
  },
  {
    key: "value",
    header: "Vale",
    numeric: true,
    amount: "lead",
    card: "sub",
    cell: (row) => <Amount value={row.value} missingReason="sin dato" />,
  },
  {
    key: "gain",
    header: "Ganado",
    numeric: true,
    cell: (row) =>
      row.gap === undefined ? (
        <Figure value={row.gainPct} unit="percent" decimals="auto" signed coloured />
      ) : (
        <span class="nodata">sin cifra</span>
      ),
  },
  {
    key: "xirr",
    header: "Anual",
    numeric: true,
    card: "figure",
    cell: (row) =>
      row.gap === undefined ? (
        <Figure value={row.xirrPct} unit="percent" decimals={1} signed coloured />
      ) : (
        <span class="nodata">sin cifra</span>
      ),
    cardCell: (row) =>
      row.gap === undefined ? (
        <Figure value={row.xirrPct} unit="percent" decimals={1} signed coloured />
      ) : (
        <span class="nodata">sin cifra</span>
      ),
  },
];

export const ReturnsCard = (props: { view: ReturnsView }): JSX.Element => (
  <Section
    title="Rentabilidad"
    class="span-12 returns-card"
    aside={
      <Show when={props.view.from}>{(from) => <span>desde el {formatDate(from())}</span>}</Show>
    }
  >
    <Show
      when={props.view.gap === undefined || props.view.value !== undefined}
      fallback={
        <Notice severity="info" title="Sin cifra">
          Todavía no se puede calcular: {props.view.gap}.
        </Notice>
      }
    >
      <div class="returns-headline">
        <StatLine label="Has aportado">
          <Amount value={props.view.contributed} missingReason="sin dato" />
        </StatLine>
        <StatLine label="Vale ahora">
          <Amount value={props.view.value} missingReason="sin dato" />
        </StatLine>
        <StatLine label="Has ganado">
          <Amount value={props.view.gain} signed coloured missingReason="sin dato" />{" "}
          <Figure value={props.view.gainPct} unit="percent" decimals="auto" signed coloured />
        </StatLine>
        <StatLine label="Rentabilidad anual, ponderada por dinero">
          <Show
            when={props.view.xirrPct}
            fallback={<span class="nodata">{props.view.gap ?? "sin dato"}</span>}
          >
            <Figure value={props.view.xirrPct} unit="percent" decimals={1} signed coloured />
          </Show>
        </StatLine>
        <StatLine label="Rentabilidad anual real, descontando el IPC">
          <Show when={props.view.real?.xirrPct} fallback={<span class="nodata">sin dato</span>}>
            <Figure value={props.view.real?.xirrPct} unit="percent" decimals={1} signed coloured />
          </Show>
        </StatLine>
      </div>
      <Show when={props.view.real?.note}>{(note) => <p class="card-note">Real: {note()}.</p>}</Show>
    </Show>
    <Show when={props.view.classes.length > 0}>
      <h3 class="block-title">Por tipo de activo</h3>
      <DataTable
        label="Rentabilidad por tipo de activo"
        columns={COLUMNS}
        rows={props.view.classes}
        maskedMerge
      />
      <For each={props.view.classes.filter((row) => row.gap !== undefined)}>
        {(row) => (
          <p class="card-note">
            {row.label}: {row.gap}.
          </p>
        )}
      </For>
    </Show>
  </Section>
);
