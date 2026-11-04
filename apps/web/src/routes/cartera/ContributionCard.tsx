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
// three figures, what goes to each asset, and the way to record it. The notes, the plan per platform
// and the whole calculation — value today, shortfall, weight after — are one tap away.

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
import { PlatformSection, PurchasesOnly, UnassignedOrders } from "./PlatformsBlock.jsx";
import { PlanRepurchaseNotes, type Repurchase } from "./plan-repurchase.jsx";
import { REMEDIES } from "./remedies.js";
import { ProposalNote, SplitNotes } from "./SplitNotes.jsx";

/** A refusal with a known remedy is a pending datum, never an error. */
const Refusal = (props: { error: AppError }): JSX.Element => (
  <Show
    when={REMEDIES[props.error.code]}
    fallback={<ErrorView error={props.error} title="La aportación no se puede repartir" />}
  >
    {(remedy) => <Pending action={remedy()}>{props.error.message}</Pending>}
  </Show>
);

const Split = (props: { view: ContributionView; repurchase?: Repurchase }): JSX.Element => {
  const wide = mediaQuery(GRID);
  const active = (): ContributionRowView[] => props.view.rows.filter((row) => !row.idle);
  const platforms = (): number => props.view.platforms?.rows.length ?? 0;
  const notes = (): JSX.Element => (
    <>
      <p class="card-note" data-testid="amount-origin">
        {props.view.fromSettings
          ? "Importe de los ajustes (aportación mensual)."
          : "Importe escrito aquí para este mes; no se guarda."}
      </p>
      <p class="card-note">
        El cubo se lleva su parte antes del reparto: es un presupuesto, no una asignación, y nunca
        entra en los pesos objetivo.
      </p>
      <PurchasesOnly view={props.view} />
      <SplitNotes view={props.view} />
    </>
  );
  const calculation = (): JSX.Element => (
    <div class="split-calc">
      <DataTable label="Cálculo del reparto" columns={COLUMNS} rows={props.view.rows} size="sm" />
    </div>
  );
  const foot = (): JSX.Element => (
    <A href="/registrar/buy" class="card-foot">
      <span>Registrar estas compras</span>
      <Icon name="arrow" class="icon-sm" />
    </A>
  );
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
          <dt>
            {wide() ? "Al cubo" : "Cubo"}
            <Show when={props.view.bucketPct}>
              {" "}
              <Figure value={props.view.bucketPct} unit="percent" decimals="auto" />
            </Show>
          </dt>
          <dd>
            <Amount value={props.view.bucketBudget} />
          </dd>
        </div>
        <div class="kpi">
          <dt>
            {wide() ? "A la cartera" : "Cartera"}
            <Show when={props.view.corePct}>
              {" "}
              <Figure value={props.view.corePct} unit="percent" decimals="auto" />
            </Show>
          </dt>
          <dd>
            <Amount value={props.view.coreAmount} />
          </dd>
        </div>
      </dl>

      <ul class="rows" aria-label="Reparto de la aportación">
        <For each={active()}>
          {(row) => (
            <li>
              <div class="row">
                <span class="main">
                  <span class="title truncate" title={row.name}>
                    {row.name}
                  </span>
                  <Show when={row.whole}>
                    {(whole) => (
                      <span class="sub" data-testid="whole-units">
                        enteras: <Amount quantity={whole().units} of={row.units} /> · sobran{" "}
                        <Amount value={whole().leftover} />
                      </span>
                    )}
                  </Show>
                </span>
                <span class="split-figs">
                  <Show when={row.sharePct}>
                    <span class="meta">
                      <Figure value={row.sharePct} unit="percent" decimals={1} /> ·{" "}
                    </span>
                  </Show>
                  <Amount value={row.allocation} class="fig" />
                </span>
              </div>
              <PlanRepurchaseNotes warnings={props.repurchase?.(row.assetId) ?? []} />
            </li>
          )}
        </For>
      </ul>
      <UnassignedOrders view={props.view.platforms} />
      {/* On a computer the two details fold apart; on a phone, everything but the split. */}
      <Show
        when={wide()}
        fallback={
          <>
            {foot()}
            <Disclosure label="Notas, plataformas y por qué">
              {notes()}
              <ProposalNote />
              <Show when={platforms() > 0}>
                <h3 class="block-title">Por plataforma</h3>
                <PlatformSection view={props.view} />
              </Show>
              <h3 class="block-title">Por qué este reparto</h3>
              {calculation()}
            </Disclosure>
          </>
        }
      >
        <Show when={props.view.purchasesOnly}>
          <p class="card-note">
            Con este importe quedan activos por debajo de su peso. Es la aritmética de hoy, no una
            previsión.
          </p>
        </Show>
        {foot()}
        <ProposalNote />
        <Show when={platforms() > 0}>
          <Disclosure label={`Por plataforma (${platforms()})`}>
            <PlatformSection view={props.view} />
          </Disclosure>
        </Show>
        <Disclosure label="Por qué este reparto">
          {notes()}
          {calculation()}
        </Disclosure>
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
  /** What a purchase of the plan would defer; loaded apart, so absent at first. */
  repurchase?: Repurchase;
}): JSX.Element => (
  <Section
    title={
      props.view === undefined
        ? "Aportación del mes"
        : `Aportación de ${formatMonth(props.view.date)}`
    }
    class="cartera-contribution"
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
          hint="Vacío usa los ajustes. No se guarda."
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
          <Split view={view()} {...(props.repurchase ? { repurchase: props.repurchase } : {})} />
        </>
      )}
    </Show>
  </Section>
);
