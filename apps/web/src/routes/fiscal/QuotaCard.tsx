// "¿Cuánto pagaría por esto?" — the estimated quota of the savings base, under
// the base it is computed from. It says it is an estimate in its title and in
// its first line, every time: it does not know the rest of the return, and a
// figure that looks like the liquidation would be read as one.

import { For, type JSX, Show } from "solid-js";
import {
  Amount,
  type DataColumn,
  DataTable,
  Figure,
  Notice,
  Pending,
  Section,
  StatLine,
  Tag,
  TotalLine,
} from "../../components/index.js";
import type { QuotaBracketView, QuotaView } from "../../view-models/fiscal/quota.js";
import { ExternalIncomeCard } from "./ExternalIncomeCard.jsx";
import type { Estimate } from "./estimates.js";

const COLUMNS: DataColumn<QuotaBracketView>[] = [
  { key: "label", header: "Tramo", card: "title", cell: (row) => row.label },
  {
    key: "rate",
    header: "Tipo",
    numeric: true,
    card: "sub",
    cell: (row) => <Figure value={row.rate_pct} unit="percent" decimals="auto" />,
  },
  {
    key: "base",
    header: "Base en el tramo",
    numeric: true,
    card: "meta",
    cell: (row) => <Amount value={row.base_eur} />,
  },
  {
    key: "quota",
    header: "Cuota",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.quota_eur} />,
  },
];

export const QuotaCard = (props: { view: QuotaView }): JSX.Element => (
  <Section
    title="Cuota estimada del ahorro"
    class="span-12"
    label={`Cuota estimada del ahorro de ${props.view.year}`}
    aside={<Tag>estimación</Tag>}
  >
    <Show
      when={props.view.computed}
      fallback={
        <Pending>
          No hay escala del ahorro comprobada para {props.view.year}: la cuota no se calcula.
        </Pending>
      }
    >
      <p class="card-note">
        Lo que pagarías por la base del ahorro con la escala de {props.view.year}, la del Estado y
        la de tu comunidad (régimen común; no vale en el País Vasco ni en Navarra). Es una
        estimación: no conoce el resto de tu Renta y supone que tu mínimo personal y familiar se
        agota en la base general.
      </p>
      <DataTable
        label={`Base del ahorro por tramos de ${props.view.year}`}
        size="sm"
        rows={props.view.brackets}
        columns={COLUMNS}
      />
      <Show when={props.view.external_eur}>
        {(external) => (
          <StatLine label="De esa base, rendimientos de fuera de la cartera">
            <Amount value={external()} />
          </StatLine>
        )}
      </Show>
      <Show when={props.view.state_eur}>
        {(state) => (
          <StatLine label="Parte del Estado">
            <Amount value={state()} />
          </StatLine>
        )}
      </Show>
      <Show when={props.view.regional_eur}>
        {(regional) => (
          <StatLine label="Parte de la comunidad">
            <Amount value={regional()} />
          </StatLine>
        )}
      </Show>
      <TotalLine label="Cuota íntegra del ahorro">
        <Amount value={props.view.quota_eur} />
      </TotalLine>
      <StatLine label="Tipo medio">
        <Figure value={props.view.average_rate_pct} unit="percent" />
      </StatLine>
      <StatLine label="Tipo del siguiente euro de base">
        <Figure value={props.view.marginal_rate_pct} unit="percent" decimals="auto" />
      </StatLine>
      <Show when={props.view.room_to_next_eur}>
        {(room) => (
          <StatLine label="Base que cabe todavía en este tramo">
            <Amount value={room()} />
          </StatLine>
        )}
      </Show>
      <Show when={props.view.deduction_eur}>
        {(deduction) => (
          <StatLine label="Deducción por doble imposición internacional">
            <Amount value={deduction().neg()} />
          </StatLine>
        )}
      </Show>
      <StatLine label="Retenciones (parte del ahorro, estimación)">
        <Amount value={props.view.withholdings_eur.neg()} />
      </StatLine>
      <TotalLine label="Resultado estimado de esta parte">
        <Amount value={props.view.result_eur} signed />
      </TotalLine>
      <p class="card-note">
        Positivo, a pagar; negativo, a devolver. Las retenciones se restan en la Renta de toda la
        cuota, no solo de esta parte.
        <Show when={props.view.source}>{(source) => <> Escala: {source()}.</>}</Show>
      </p>
    </Show>
    <For each={props.view.notes}>
      {(note) => <Notice severity={note.severity}>{note.text}</Notice>}
    </For>
  </Section>
);

/** The quota and, beside it, the income from outside the portfolio it counts. */
export const EstimateCards = (props: { estimate: Estimate }): JSX.Element => (
  <>
    <QuotaCard view={props.estimate.quota} />
    <ExternalIncomeCard view={props.estimate.external} />
  </>
);
