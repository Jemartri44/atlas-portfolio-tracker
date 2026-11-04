// «¿Cómo va?» — what the core has earned on the money put into it: «he aportado X, vale Y, he
// ganado Z %», the money-weighted annual rate and the real one (discounting the CPI), and the same
// by asset class. Core only: the bucket never takes part. Everything comes from the domain
// (`coreXirr`, `classReturns`); a figure whose data is missing is not shown, the sentence says what
// is missing. The percentages stay in sight with the privacy mode on; the amounts are masked.

import type { LedgerEvent } from "@atlas/domain";
import { For, type JSX, Show } from "solid-js";
import {
  Amount,
  type DataColumn,
  DataTable,
  Disclosure,
  Figure,
  FoldSection,
  Notice,
  StatLine,
} from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import type { ClassReturnRowView, ReturnsView } from "../../view-models/core/returns.js";
import { AfterTaxLines } from "./AfterTaxLines.jsx";

const Gain = (props: { row: ClassReturnRowView }): JSX.Element =>
  props.row.gap === undefined ? (
    <Figure value={props.row.gainPct} unit="percent" decimals="auto" signed coloured />
  ) : (
    <span class="nodata">sin cifra</span>
  );

const COLUMNS: readonly DataColumn<ClassReturnRowView>[] = [
  { key: "class", header: "Tipo de activo", card: "title", cell: (row) => row.label },
  {
    key: "invested",
    header: "Comprado",
    numeric: true,
    amount: true,
    card: "meta",
    cell: (row) => <Amount value={row.invested} missingReason="sin dato" />,
    cardCell: (row) =>
      row.invested === undefined ? null : (
        <span>
          comprado <Amount value={row.invested} />
        </span>
      ),
  },
  {
    key: "returned",
    header: "Recuperado",
    numeric: true,
    amount: true,
    card: "meta",
    cell: (row) => <Amount value={row.returned} missingReason="sin dato" />,
    cardCell: (row) =>
      row.returned === undefined ? null : (
        <span>
          recuperado <Amount value={row.returned} />
        </span>
      ),
  },
  {
    key: "value",
    header: "Vale",
    numeric: true,
    amount: "lead",
    card: "sub",
    cell: (row) => <Amount value={row.value} missingReason="sin dato" />,
    cardCell: (row) =>
      row.value === undefined ? null : (
        <span>
          vale <Amount value={row.value} />
        </span>
      ),
  },
  {
    key: "gain",
    header: "Ganado",
    numeric: true,
    card: "figureSub",
    cell: (row) => <Gain row={row} />,
    cardCell: (row) => (
      <span>
        ganado <Gain row={row} />
      </span>
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
  },
];

/** The line of the folded card: what was earned, or why there is no figure. */
const Headline = (props: { view: ReturnsView }): JSX.Element => (
  <Show when={props.view.gain} fallback={`Sin cifra: ${props.view.gap ?? "sin dato"}`}>
    <Amount value={props.view.gain} signed coloured />
    <Show when={props.view.gainPct}>
      {" · "}
      <Figure value={props.view.gainPct} unit="percent" decimals="auto" signed coloured />
    </Show>
    <Show when={props.view.xirrPct}>
      {" · "}
      <Figure value={props.view.xirrPct} unit="percent" decimals={1} signed coloured /> al año
    </Show>
  </Show>
);

export const ReturnsCard = (props: {
  view: ReturnsView;
  events: readonly LedgerEvent[];
  to: string;
}): JSX.Element => (
  <FoldSection
    title="Rentabilidad"
    class="returns-card"
    summary={<Headline view={props.view} />}
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
          <Show
            when={props.view.gainPct}
            fallback={<span class="nodata">sin porcentaje: nada aportado en neto</span>}
          >
            <Figure value={props.view.gainPct} unit="percent" decimals="auto" signed coloured />
          </Show>
        </StatLine>
        <StatLine label="Rentabilidad anual, ponderada por dinero">
          <Show
            when={props.view.xirrPct}
            fallback={<span class="nodata">{props.view.gap ?? "sin dato"}</span>}
          >
            <Figure value={props.view.xirrPct} unit="percent" decimals={1} signed coloured />
          </Show>
        </StatLine>
      </div>
      <Disclosure label="Después de impuestos, real y sus notas">
        <div class="returns-headline">
          <AfterTaxLines events={props.events} to={props.to} />
          <StatLine label="Rentabilidad anual real, descontando el IPC">
            <Show when={props.view.real?.xirrPct} fallback={<span class="nodata">sin cifra</span>}>
              <Figure
                value={props.view.real?.xirrPct}
                unit="percent"
                decimals={1}
                signed
                coloured
              />
            </Show>
          </StatLine>
          <Show when={props.view.real?.gain}>
            {(gain) => (
              <StatLine label="Has ganado, descontando el IPC">
                <Amount value={gain()} signed coloured missingReason="sin dato" />
              </StatLine>
            )}
          </Show>
        </div>
        <Show when={props.view.real?.note}>
          {(note) => <p class="card-note">Real: {note()}.</p>}
        </Show>
      </Disclosure>
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
          <For each={row.reasons ?? [row.gap]}>
            {(reason) => (
              <p class="card-note">
                {row.label}: {reason}.
              </p>
            )}
          </For>
        )}
      </For>
    </Show>
  </FoldSection>
);
