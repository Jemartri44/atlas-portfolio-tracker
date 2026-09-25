// "¿Dónde va el dinero este mes?" — the split of the monthly contribution.
//
// Two things the card says every time, and they are not decoration:
//   - the bucket share is a **budget**, separated first and never allocated
//     among the target weights (constitution III);
//   - this is a **proposal**. The orders are placed by hand on the platform and
//     recorded afterwards; the application has never sent an order and never
//     will.
//
// On screen (docs/design/system.md §7.5): the «Propuesta» tag, the strip of
// three figures, what goes to each asset, and the note. The whole calculation
// — value today, shortfall, weight after — is one tap away.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import {
  Amount,
  type DataColumn,
  DataTable,
  Disclosure,
  ErrorView,
  Figure,
  Icon,
  Notice,
  Pending,
  Section,
  Tag,
} from "../../components/index.js";
import { formatMonth } from "../../format/date.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { type NameIndex, NO_NAMES } from "../../format/names.js";
import type { AppError } from "../../ledger/state.js";
import { store } from "../../ledger/state.js";
import type { ContributionRowView, ContributionView } from "../../view-models/core/index.js";

/**
 * What fixes each refusal, and where. The button used to be written by hand as
 * "Registrar una valoración", so it also appeared when what was missing were
 * the target weights, and sent the user to a form that could not help.
 */
const REMEDIES: Record<string, { label: string; to: string }> = {
  missing_manual_prices: { label: "Registrar una valoración", to: "/registrar/valuation" },
  missing_target_weights: { label: "Fijar los pesos objetivo", to: "/ajustes/configuracion" },
  no_target_weight_in_table: { label: "Revisar los pesos objetivo", to: "/ajustes/configuracion" },
  missing_bucket_pct: { label: "Revisar la configuración", to: "/ajustes/configuracion" },
  missing_amount: { label: "Fijar la aportación mensual", to: "/ajustes/configuracion" },
};

const COLUMNS: readonly DataColumn<ContributionRowView>[] = [
  {
    key: "name",
    header: "Activo",
    card: "title",
    cell: (row) => row.name,
    hint: (row) => row.name,
  },
  {
    key: "value",
    header: "Valor hoy",
    numeric: true,
    cell: (row) => <Amount value={row.value} />,
  },
  {
    key: "gap",
    header: "Déficit",
    numeric: true,
    card: "sub",
    cell: (row) => <Amount value={row.gap} />,
    cardCell: (row) => (
      <span>
        déficit <Amount value={row.gap} /> · objetivo{" "}
        <Figure value={row.targetPct} unit="percent" decimals="auto" />
      </span>
    ),
  },
  {
    key: "allocation",
    header: "Aportar",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.allocation} />,
  },
  {
    key: "after",
    header: "Peso tras",
    numeric: true,
    cell: (row) => <Figure value={row.weightAfterPct} unit="percent" />,
  },
];

/** A refusal with a known remedy is a pending datum, never an error. */
const Refusal = (props: { error: AppError }): JSX.Element => (
  <Show
    when={REMEDIES[props.error.code]}
    fallback={<ErrorView error={props.error} title="La aportación no se puede repartir" />}
  >
    {(remedy) => <Pending action={remedy()}>{props.error.message}</Pending>}
  </Show>
);

const Split = (props: { view: ContributionView }): JSX.Element => {
  const active = (): ContributionRowView[] => props.view.rows.filter((row) => !row.idle);
  const idle = (): string[] => props.view.rows.filter((row) => row.idle).map((row) => row.name);
  return (
    <>
      <dl class="kpis">
        <div class="kpi">
          <dt title={props.view.fromSettings ? "La de la configuración" : undefined}>Este mes</dt>
          <dd>
            <Amount value={props.view.amount} />
          </dd>
        </div>
        <div class="kpi">
          <dt>Al cubo</dt>
          <dd>
            <Amount value={props.view.bucketBudget} />
          </dd>
        </div>
        <div class="kpi">
          <dt>A la cartera</dt>
          <dd>
            <Amount value={props.view.coreAmount} />
          </dd>
        </div>
      </dl>
      <p class="card-note">
        El cubo se lleva su parte antes del reparto: es un presupuesto, no una asignación, y nunca
        entra en los pesos objetivo.
      </p>

      <h3 class="block-title">Reparto en la cartera</h3>
      <ul class="rows" aria-label="Reparto de la aportación">
        <For each={active()}>
          {(row) => (
            <li>
              <div class="row">
                <span class="main">
                  <span class="title truncate" title={row.name}>
                    {row.name}
                  </span>
                  <span class="sub">
                    <span>
                      {row.assetClass} · peso tras aportar{" "}
                      <Figure value={row.weightAfterPct} unit="percent" decimals={1} />
                    </span>
                  </span>
                </span>
                <span class="figs">
                  <span class="fig">
                    <Amount value={row.allocation} />
                  </span>
                </span>
              </div>
            </li>
          )}
        </For>
      </ul>
      <Show when={idle().length > 0}>
        <p class="card-note">{idle().join(", ")}: nada este mes.</p>
      </Show>
      <Show when={props.view.surplusDistributed}>
        <p class="card-note">
          La aportación cubre el déficit de todos los activos: el sobrante se reparte por pesos
          objetivo.
        </p>
      </Show>

      <p class="note-line">
        <Icon name="info" class="icon-sm" />
        <span>
          Es una propuesta y nada se ha registrado: da las órdenes a mano en tu plataforma y
          regístralas después desde <A href="/registrar">Registrar</A>.
        </span>
      </p>
      <Disclosure label="Ver el cálculo">
        <DataTable label="Cálculo del reparto" columns={COLUMNS} rows={props.view.rows} size="sm" />
      </Disclosure>
    </>
  );
};

export const ContributionCard = (props: {
  view: ContributionView | undefined;
  error: AppError | undefined;
  names?: NameIndex;
}): JSX.Element => (
  <Section
    title={
      props.view === undefined
        ? "Aportación del mes"
        : `Aportación de ${formatMonth(props.view.date)}`
    }
    class="span-5 is-natural"
    aside={props.view === undefined ? undefined : <Tag tone="accent">Propuesta</Tag>}
  >
    <Show
      when={props.view}
      fallback={
        <Show when={props.error} fallback={<p class="meta">Sin datos.</p>}>
          {(error) => <Refusal error={error()} />}
        </Show>
      }
    >
      {(view) => (
        <>
          <Show when={view().approximation}>
            {(note) => (
              <Notice severity="caution">
                {describeWarning(note(), {
                  names: props.names ?? NO_NAMES,
                  privacy: store.privacy(),
                })}
              </Notice>
            )}
          </Show>
          <Split view={view()} />
        </>
      )}
    </Show>
  </Section>
);
