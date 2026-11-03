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
import { GRID, mediaQuery } from "../../shell/media.js";
import { privacy } from "../../shell/preferences.js";
import type { ContributionRowView, ContributionView } from "../../view-models/core/index.js";
import { COLUMNS } from "./contribution-columns.jsx";
import { PlatformSection } from "./PlatformsBlock.jsx";
import { REMEDIES } from "./remedies.js";
import { SplitNotes } from "./SplitNotes.jsx";

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
  const wide = mediaQuery(GRID);
  const active = (): ContributionRowView[] => props.view.rows.filter((row) => !row.idle);
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
                    <Show when={row.whole}>
                      {(whole) => (
                        <span data-testid="whole-units">
                          {" "}
                          · enteras: <Amount quantity={whole().units} of={row.units} /> · sobran{" "}
                          <Amount value={whole().leftover} />
                        </span>
                      )}
                    </Show>
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
              <Show when={row.sharePct}>
                {(share) => (
                  <svg class={`share-line is-${row.classKey}`} aria-hidden="true">
                    <rect class="share-line-track" x="0" y="0" width="100%" height="100%" rx="2" />
                    <rect
                      class="share-line-bar"
                      x="0"
                      y="0"
                      width={`${Math.min(100, Math.max(0, Number.parseFloat(share())))}%`}
                      height="100%"
                      rx="2"
                    />
                  </svg>
                )}
              </Show>
            </li>
          )}
        </For>
      </ul>
      <PlatformSection view={props.view} />
      <A href="/registrar/buy" class="card-foot">
        <span>Registrar estas compras</span>
        <Icon name="arrow" class="icon-sm" />
      </A>
      <SplitNotes view={props.view} />
      {/* The calculation, whole on a computer and folded on a phone (the approved report, §4). */}
      <Show
        when={wide()}
        fallback={
          <Disclosure label="Por qué este reparto">
            <DataTable
              label="Cálculo del reparto"
              columns={COLUMNS}
              rows={props.view.rows}
              size="sm"
            />
          </Disclosure>
        }
      >
        <h3 class="block-title">Por qué este reparto</h3>
        <div class="split-calc">
          <DataTable
            label="Cálculo del reparto"
            columns={COLUMNS}
            rows={props.view.rows}
            size="sm"
          />
        </div>
      </Show>
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
                  privacy: privacy(),
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
