// "¿Dónde va el dinero este mes?" — the screen the user opens at the start of
// the month, on the phone, before placing the orders by hand.
//
// **One date, one projection.** Every block reads the ledger cut at the date in
// the address bar (`asOf`, ADR-0016) and nobody touches the base snapshot: that
// is the defect of quantities from the end of the ledger
// read with the prices of another day — made impossible by construction.
//
// A block the domain refuses (no prices, no target weights) explains itself and leaves the others
// standing.
//
// Composition (docs/design/system.md §7.5): from 1024px two columns that go their own way, the
// weights and the return on the left, the contribution, the exposure and the rebalance on the right,
// and the costs and the projection across; the date in force to the right of the title. An empty
// ledger is one card with the next step.

import { assets, coreWeights, ledgerEntries, settingsAt } from "@atlas/domain";
import { classReturns, coreXirr, spanishCpiPct } from "@atlas/domain/charts";
import { contributionPlan, costSummary, platformPlan } from "@atlas/domain/portfolio";
import { createMemo, createSignal, type JSX, Show } from "solid-js";
import { AsOfPicker, useAsOf } from "../../components/index.js";
import { nameIndex } from "../../format/names.js";
import { attempt } from "../../ledger/query.js";
import { store } from "../../ledger/state.js";
import { QuotesNotice, useQuotes } from "../../prices/use-quotes.jsx";
import { GRID, mediaQuery } from "../../shell/media.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import {
  contributionView,
  costsView,
  platformsView,
  typedAmount,
  type UnitPrices,
  weightsView,
} from "../../view-models/core/index.js";
import { returnsView } from "../../view-models/core/returns.js";
import { unitPricesOf } from "../../view-models/core/whole-units.js";
import { onboardingOf } from "../../view-models/index.js";
import { absorbedAssets } from "../../view-models/weighted.js";
import { RequireLedger } from "../guard.jsx";
import { ContributionCard } from "./ContributionCard.jsx";
import { CostsCard } from "./CostsCard.jsx";
import { ExposureBlock } from "./ExposureBlock.jsx";
import { NothingBought } from "./NothingBought.jsx";
import { ProjectionCard } from "./ProjectionCard.jsx";
import { usePlanRepurchase } from "./plan-repurchase.jsx";
import { RebalanceCard } from "./RebalanceCard.jsx";
import { ReturnsCard } from "./ReturnsCard.jsx";
import { TotalCostCard } from "./TotalCostCard.jsx";
import { WeightsCard } from "./WeightsCard.jsx";

export default function CarteraRoute(): JSX.Element {
  const asOf = useAsOf();

  return (
    <RequireLedger skeleton={8}>
      {(snapshot) => {
        const names = nameIndex(snapshot.state);
        const date = (): string => asOf.date();
        const dated = () => store.projectionAt(date()) ?? snapshot.state;
        const settings = () => settingsAt(dated(), date()).settings;
        const prices = useQuotes(snapshot.state);
        const external = () => prices.external(dated());

        const projection = createMemo(() => coreWeights(dated(), date(), settings(), external()));
        const weights = createMemo(() => weightsView(projection(), names));
        const catalogue = createMemo(
          () =>
            new Map(
              assets(dated()).map((asset) => [
                asset.asset_id,
                asset.isin === undefined ? {} : { isin: asset.isin },
              ]),
            ),
        );
        /** Unit prices fit for the informative whole units (see `unitPricesOf`). */
        const unitPrices = createMemo<UnitPrices>(() =>
          unitPricesOf(
            projection().rows,
            new Map(assets(dated()).map((asset) => [asset.asset_id, asset.asset_type])),
          ),
        );
        // The amount typed for this month lives on the screen only: nothing is
        // persisted, and an invalid text falls back to the settings.
        const [amountText, setAmountText] = createSignal("");
        const typed = createMemo(() => typedAmount(amountText()));
        const contribution = createMemo(() =>
          attempt(() => {
            const quotes = external();
            const override = typed();
            const split = contributionPlan(dated(), {
              date: date(),
              settings: settings(),
              ...(override.kind === "amount" ? { amount: override.value } : {}),
              ...(quotes === undefined ? {} : { external: quotes }),
            });
            const platforms = platformPlan(
              dated(),
              snapshot.events,
              date(),
              split.rows.map((row) => ({ asset_id: row.asset_id, amount_eur: row.allocation_eur })),
            );
            return contributionView(split, names, unitPrices(), platformsView(platforms, names));
          }),
        );
        /** Funds converted into another and holding nothing: not listed, not offered. */
        const absorbed = createMemo(() => absorbedAssets(dated(), snapshot.events, date()));
        const summary = createMemo(() =>
          costSummary(dated(), snapshot.events, date(), settings(), date(), external()),
        );
        const costs = createMemo(() => costsView(summary(), names, absorbed()));

        const returns = createMemo(() =>
          returnsView(
            coreXirr(snapshot.events, date(), spanishCpiPct()),
            classReturns(snapshot.events, date()),
            names,
          ),
        );

        const plan = () => {
          const outcome = contribution();
          return outcome.ok ? outcome.value : undefined;
        };
        const planError = () => {
          const outcome = contribution();
          return outcome.ok ? undefined : outcome.error;
        };
        // A purchase of the plan that would defer a loss: said beside it, never removed.
        const repurchase = usePlanRepurchase(() => ({
          events: snapshot.events,
          view: plan(),
          date: date(),
        }));

        const wide = mediaQuery(GRID);
        // Nothing bought yet: seven cards of «sin cifra» say less than the next step.
        const empty = () =>
          onboardingOf(
            dated(),
            ledgerEntries(snapshot.state, snapshot.events, { to: date() }),
            settings(),
          ) !== undefined;
        const weightsCard = (): JSX.Element => (
          <WeightsCard
            view={weights()}
            threshold={settings().deviation_threshold_pp}
            state={dated()}
            date={date()}
            settings={settings()}
            absorbed={absorbed()}
            names={names}
            weightedTer={costs().core.weightedTer}
          />
        );
        const contributionCard = (): JSX.Element => (
          <ContributionCard
            view={plan()}
            error={planError()}
            names={names}
            repurchase={repurchase}
            amountText={amountText()}
            onAmountText={setAmountText}
            amountError={(() => {
              const outcome = typed();
              return outcome.kind === "invalid" ? outcome.message : undefined;
            })()}
          />
        );
        const returnsCard = (): JSX.Element => (
          <ReturnsCard view={returns()} events={snapshot.events} to={date()} />
        );
        const exposureCard = (): JSX.Element => (
          <ExposureBlock weights={projection()} catalogue={catalogue()} names={names} />
        );
        const rebalanceCard = (): JSX.Element => (
          <RebalanceCard
            state={dated()}
            events={snapshot.events}
            date={date()}
            settings={settings()}
            external={external()}
            names={names}
          />
        );

        return (
          <>
            <PageHeader
              title="Cartera"
              actions={
                <AsOfPicker
                  date={date()}
                  isToday={asOf.isToday()}
                  onChange={asOf.set}
                  hint="Corta todos tus datos por esa fecha: cantidades, precios y avisos."
                />
              }
            />

            <QuotesNotice prices={prices} />
            <Show when={!empty()} fallback={<NothingBought />}>
              <div class="grid">
                <Show
                  when={wide()}
                  fallback={
                    <>
                      {weightsCard()}
                      {contributionCard()}
                      {returnsCard()}
                      {exposureCard()}
                      {rebalanceCard()}
                    </>
                  }
                >
                  <div class="stack span-7">
                    {weightsCard()}
                    {returnsCard()}
                  </div>
                  <div class="stack span-5">
                    {contributionCard()}
                    {exposureCard()}
                    {rebalanceCard()}
                  </div>
                </Show>
                <CostsCard view={costs()} />
                <TotalCostCard summary={summary()} settings={settings()} />
                <ProjectionCard weights={projection()} settings={settings()} asOf={date()} />
              </div>
            </Show>
          </>
        );
      }}
    </RequireLedger>
  );
}
