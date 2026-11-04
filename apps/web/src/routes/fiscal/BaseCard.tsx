// The savings base: the one hero figure of the screen, always broken down.
//
// Three things it has to say and does: that it is a
// **fiscal total**, core and bucket together, which is the first exception of
// the constitution and the only place in the application where the two books
// are added up; that it is the **base**, not what is paid, because the
// application does not compute the tax due; and where each total comes from —
// every one of them opens into its operations, named by asset and date.

import { For, type JSX, Show } from "solid-js";
import type { DataColumn } from "../../components/index.js";
import { Amount, DataTable, Disclosure, Section, StatLine, Tag } from "../../components/index.js";
import { GRID, mediaQuery } from "../../shell/media.js";
import type { FiscalRow, YearView } from "../../view-models/fiscal/index.js";
import { CriteriaList, CriteriaTags } from "./Criteria.jsx";

/** One operation behind a total: what it was, when, how much it puts in. */
const ROW_COLUMNS: DataColumn<FiscalRow>[] = [
  { key: "subject", header: "Activo", card: "title", cell: (row) => row.subject },
  { key: "kind", header: "Operación", card: "sub", cell: (row) => row.kind },
  { key: "date", header: "Fecha fiscal", card: "sub", cell: (row) => row.date },
  {
    key: "criteria",
    header: "Criterios",
    card: "meta",
    cell: (row) => <CriteriaTags criteria={row.criteria} />,
  },
  {
    key: "amount",
    header: "Computable",
    numeric: true,
    card: "figure",
    cell: (row) => (
      <>
        <Amount value={row.amount_eur} coloured />
        <Show when={row.provisional_until}>
          {(until) => (
            <Tag
              tone="caution"
              icon="clock"
              title={`Su ventana de recompra sigue abierta: una compra hasta el ${until()} aplazaría esta pérdida.`}
            >
              provisional hasta el {until()}
            </Tag>
          )}
        </Show>
      </>
    ),
  },
];

/** On a phone the two totals go in a line, with the name a line can hold. */
const SHORT: Readonly<Record<string, string>> = {
  "Ganancias y pérdidas patrimoniales": "Ganancias y pérdidas",
  "Rendimientos del capital mobiliario": "Capital mobiliario",
};

export const BaseCard = (props: { view: YearView }): JSX.Element => {
  const wide = mediaQuery(GRID);
  const note = (): JSX.Element => (
    <p class="card-note">
      Es la base sobre la que se calcula el impuesto del ahorro, no lo que pagas. Suma tu cartera
      principal y tu cubo, porque Hacienda te mira entero.
    </p>
  );
  const groups = (): JSX.Element => (
    <>
      <For each={props.view.groups}>
        {(group) => (
          <Disclosure
            label={
              <span class="group-head">
                <span>{group.title}</span>
                <Amount value={group.total_eur} coloured class="group-total" />
              </span>
            }
          >
            <Show when={group.note}>{(text) => <p class="card-note">{text()}</p>}</Show>
            <Show
              when={group.rows.length > 0}
              fallback={<p class="card-note">No hay operaciones de este tipo en el ejercicio.</p>}
            >
              <DataTable
                label={`Operaciones de ${group.title.toLowerCase()}`}
                size="sm"
                rows={group.rows}
                columns={ROW_COLUMNS}
              />
            </Show>
            <CriteriaList criteria={group.criteria} />
          </Disclosure>
        )}
      </For>

      <Show when={props.view.steps.length > 0}>
        <Disclosure label={<span class="group-head">Compensación entre apartados</span>}>
          <p class="card-note">
            Una pérdida de un apartado compensa las ganancias del otro hasta el{" "}
            {props.view.limit_pct} % de su saldo positivo.
          </p>
          <For each={props.view.steps}>
            {(step) => (
              <StatLine label={step.text}>
                <Amount value={step.amount_eur} />
              </StatLine>
            )}
          </For>
        </Disclosure>
      </Show>
    </>
  );
  return (
    <Section
      title="Base del ahorro"
      class="span-12"
      label={`Base del ahorro de ${props.view.year}`}
      aside={<span class="scope">{wide() ? "Cartera y cubo juntos" : "cartera y cubo"}</span>}
    >
      <div class="hero-main">
        <p class="hero-figure">
          <Amount value={props.view.base_eur} coloured />
        </p>
        <Show when={wide()}>{note()}</Show>
      </div>
      <Show
        when={wide()}
        fallback={
          <>
            <For each={props.view.groups}>
              {(group) => (
                <StatLine label={SHORT[group.title] ?? group.title}>
                  <Amount value={group.total_eur} coloured />
                </StatLine>
              )}
            </For>
            <Disclosure label="Qué es y sus operaciones">
              {note()}
              {groups()}
            </Disclosure>
          </>
        }
      >
        {groups()}
      </Show>
    </Section>
  );
};
