// What the contribution of the month does: the strip of three figures, what goes to each asset and
// the way to record it. The notes, the plan per platform and the calculation fold: apart on a
// computer, all in one on a phone (docs/design/system.md §7.5).

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Amount, DataTable, Disclosure, Figure, Icon } from "../../components/index.js";
import { GRID, mediaQuery } from "../../shell/media.js";
import type { ContributionRowView, ContributionView } from "../../view-models/core/index.js";
import { COLUMNS } from "./contribution-columns.jsx";
import { PlatformSection, PurchasesOnly, UnassignedOrders } from "./PlatformsBlock.jsx";
import { PlanRepurchaseNotes, type Repurchase } from "./plan-repurchase.jsx";
import { ProposalNote, SplitNotes } from "./SplitNotes.jsx";

export const Split = (props: { view: ContributionView; repurchase?: Repurchase }): JSX.Element => {
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
