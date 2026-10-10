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
  DataTable,
  Disclosure,
  ErrorView,
  Field,
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
import { COLUMNS } from "./contribution-columns.jsx";

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
          <dt>Este mes</dt>
          <dd>
            <Amount value={props.view.amount} />
          </dd>
        </div>
        <div class="kpi">
          <dt>Al cubo</dt>
          <dd>
            <Show when={props.view.bucketPct}>
              <Figure value={props.view.bucketPct} unit="percent" decimals="auto" class="share" />
            </Show>
            <Amount value={props.view.bucketBudget} class="kpi-amount" />
          </dd>
        </div>
        <div class="kpi">
          <dt>A la cartera</dt>
          <dd>
            <Show when={props.view.corePct}>
              <Figure value={props.view.corePct} unit="percent" decimals="auto" class="share" />
            </Show>
            <Amount value={props.view.coreAmount} class="kpi-amount" />
          </dd>
        </div>
      </dl>
      <p class="card-note" data-testid="amount-origin">
        {props.view.fromSettings
          ? "Importe de los ajustes (aportación mensual)."
          : "Importe escrito aquí para este mes; no se guarda."}
      </p>
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
                  <Show when={row.sharePct}>
                    <span class="fig">
                      <Figure value={row.sharePct} unit="percent" decimals={1} />
                    </span>
                  </Show>
                  <span class={row.sharePct === undefined ? "fig" : "fig-sub"}>
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
  /** What is typed in «Importe de este mes»; empty means the amount of the settings. */
  amountText?: string;
  onAmountText?: (text: string) => void;
  /** Why the typed text was not used, if it was not. */
  amountError?: string | undefined;
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
    <Show when={props.onAmountText}>
      {(onInput) => (
        <Field
          id="contribution-amount"
          kind="decimal"
          unit="€"
          label="Importe de este mes"
          placeholder="El de los ajustes"
          hint="Déjalo vacío para usar la aportación mensual de los ajustes. No se guarda."
          value={props.amountText ?? ""}
          error={props.amountError}
          onInput={onInput()}
        />
      )}
    </Show>
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
