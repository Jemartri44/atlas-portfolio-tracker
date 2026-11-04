// "¿Qué tengo que declarar?" — the fiscal screen (docs/design/system.md §7.8): a destination of
// the bar on a computer, reached from the summary on a phone. Everything comes from the domain, in
// a lazily loaded chunk: the tax engine never reaches the boot path. `YearLayout` places the cards.

import { settingsAt, yearOf } from "@atlas/domain";
import { informativeReturn, repurchaseCalendar, taxBoxes, taxYear } from "@atlas/domain/fiscal";
import { createMemo, createResource, For, type JSX, Show } from "solid-js";
import { nameIndex } from "../../format/names.js";
import { attempt } from "../../ledger/query.js";
import { store, today } from "../../ledger/state.js";
import { useQuotes } from "../../prices/use-quotes.jsx";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { privacy } from "../../shell/preferences.js";
import { boxesView, informativeView, yearView } from "../../view-models/fiscal/index.js";
import { repurchaseView } from "../../view-models/fiscal/sale.js";
import { SETUP_EVENTS } from "../../view-models/setup-events.js";
import { RequireLedger } from "../guard.jsx";
import { BaseCard } from "./BaseCard.jsx";
import { BoxesCard } from "./BoxesCard.jsx";
import { LedgerCalendar } from "./CalendarCard.jsx";
import { DoubtfulCard, SettledCard } from "./CriteriaCards.jsx";
import { downloadPackage, estimateOf } from "./estimates.js";
import { FilingCard } from "./FilingCard.jsx";
import { InformativeCard } from "./InformativeCard.jsx";
import { LossesCard } from "./LossesCard.jsx";
import { PartFailed } from "./PartFailed.jsx";
import { CannotCompute, NothingThisYear, NothingYet } from "./Placeholders.jsx";
import { EstimateCards } from "./QuotaCard.jsx";
import { InKindNotes, RateNotes } from "./RateNotes.jsx";
import { RepurchaseCard } from "./RepurchaseCard.jsx";
import { SaleSimulatorCard } from "./SaleSimulatorCard.jsx";
import { YearLayout } from "./YearLayout.jsx";
import { useYear, YearPicker } from "./YearPicker.jsx";
import { yearChoices } from "./years.js";

export default function FiscalRoute(): JSX.Element {
  return (
    <RequireLedger skeleton={8}>
      {(snapshot) => {
        const names = nameIndex(snapshot.state);
        // Informative prices, only for the "what if I sell" estimate: no figure of the return uses them.
        const prices = useQuotes(snapshot.state);
        // Reactive: a screen left open across the new year follows it.
        const current = (): number => yearOf(today());
        const choices = createMemo(() =>
          yearChoices(
            [...snapshot.state.gains, ...snapshot.state.externalIncome],
            [...snapshot.state.filings.values()],
            current(),
          ),
        );
        const picked = useYear(() => current() - 1);
        const year = (): number => picked.year();
        // The findings of the ECB check note the lines that depend on them and
        // move no figure (ADR-0029, point 8); they arrive after the first
        // paint, and the report is computed again with them.
        const [rateFindings] = createResource(() =>
          import("../../ecb/findings.js").then((module) =>
            module.rateFindingsOf(snapshot.state, snapshot.events),
          ),
        );
        const options = () => {
          const findings = rateFindings();
          return findings === undefined
            ? { today: today() }
            : { today: today(), rateFindings: findings };
        };

        /**
         * The whole year, computed once. A failure is **shown**, not thrown: a
         * ledger with invalid events cannot be read fiscally (ADR-0015), and
         * the answer to that is the list of what to repair, not a figure.
         */
        const report = createMemo(() => attempt(() => taxYear(snapshot.events, year(), options())));
        // Each part answers or says why it cannot: one that fails does not take the screen with it.
        const boxes = createMemo(() =>
          attempt(() => boxesView(taxBoxes(snapshot.events, year(), options()), names)),
        );
        const informative = createMemo(() =>
          (["720", "721"] as const).map((model) => ({
            model,
            outcome: attempt(() =>
              informativeView(
                informativeReturn(snapshot.events, model, year(), options()),
                names,
                privacy(),
              ),
            ),
          })),
        );
        const boxesCard = (): JSX.Element => {
          const result = boxes();
          return result.ok ? (
            <BoxesCard
              view={result.value}
              onDownload={() => downloadPackage(snapshot.events, year(), options(), names)}
            />
          ) : (
            <PartFailed title="Tu declaración por casillas" error={result.error} />
          );
        };
        const view = createMemo(() => {
          const computed = report();
          return computed.ok ? yearView(computed.value, names) : undefined;
        });
        const quota = createMemo(() => estimateOf(snapshot, report(), options()));
        const failure = () => {
          const computed = report();
          return computed.ok ? undefined : computed.error;
        };
        /** The comparison with what was filed, when there is one to make. */
        const filing = () => {
          const computed = report();
          return computed.ok ? computed.value.filing : undefined;
        };
        /** Nothing has ever been recorded: no purchase, no cash, no return. */
        const untouched = snapshot.events.every((event) => SETUP_EVENTS.has(event.type));
        const estimateCards = (): JSX.Element => (
          <Show when={quota()}>{(estimate) => <EstimateCards estimate={estimate()} />}</Show>
        );
        const sale = (): JSX.Element => (
          <SaleSimulatorCard
            state={snapshot.state}
            events={snapshot.events}
            date={today()}
            settings={settingsAt(snapshot.state, today()).settings}
            external={prices.external(snapshot.state)}
          />
        );
        const filingCard = (quiet: boolean): JSX.Element => (
          <FilingCard
            year={picked.year()}
            {...(filing() === undefined ? {} : { filing: filing() })}
            quiet={quiet}
          />
        );
        const modelCard = (
          one: ReturnType<typeof informative>[number] | undefined,
        ): JSX.Element => (
          <Show when={one !== undefined && store.invalidCount() === 0}>
            {((outcome, model) =>
              outcome?.ok === true ? (
                <InformativeCard view={outcome.value} />
              ) : outcome === undefined ? null : (
                <PartFailed title={`Modelo ${model}`} error={outcome.error} half />
              ))(one?.outcome, one?.model)}
          </Show>
        );
        /** The return of the year: where each card goes is `YearLayout`'s. */
        const renta = (): JSX.Element => (
          <Show when={view()}>
            {(year) => (
              <>
                <Show when={year().empty}>
                  <NothingThisYear year={year().year} />
                  {/* A year with only income from outside the portfolio still has an estimate. */}
                  <Show when={quota()?.external && quota()}>
                    {(estimate) => <EstimateCards estimate={estimate()} />}
                  </Show>
                </Show>
                <Show
                  when={!year().empty}
                  fallback={
                    <>
                      {sale()}
                      {filingCard(year().empty)}
                      <For each={informative()}>{(one) => modelCard(one)}</For>
                    </>
                  }
                >
                  <YearLayout
                    cards={{
                      base: () => <BaseCard view={year()} />,
                      estimate: quota() === undefined ? undefined : estimateCards,
                      losses: () => (
                        <LossesCard
                          year={year().year}
                          pending={year().pending}
                          expired={year().expired}
                          expiring={year().expiring}
                          anchors={year().anchors}
                        />
                      ),
                      doubtful: () => <DoubtfulCard stakes={year().doubtful} />,
                      settled: () => <SettledCard stakes={year().settled} />,
                      filing: () => filingCard(false),
                      model720: () => modelCard(informative()[0]),
                      model721: () => modelCard(informative()[1]),
                      boxes: boxesCard,
                      sale,
                    }}
                  />
                </Show>
              </>
            )}
          </Show>
        );
        return (
          <>
            <PageHeader
              title="Declaración"
              lead="Renta, Modelo 720 y Modelo 721"
              actions={
                <YearPicker
                  year={year()}
                  choices={choices()}
                  onChange={(value) => picked.set(value)}
                />
              }
            />

            <Show when={untouched}>
              <NothingYet />
            </Show>

            <Show
              when={!untouched && report().ok}
              fallback={
                <Show when={!untouched}>
                  <CannotCompute message={failure()?.message ?? ""} />
                </Show>
              }
            >
              <div class="grid">
                <LedgerCalendar events={snapshot.events} today={today()} names={names} />
                <RepurchaseCard
                  view={repurchaseView(repurchaseCalendar(snapshot.events, today()), names)}
                />
                <RateNotes
                  notes={((computed) => (computed.ok ? computed.value.notes : []))(report())}
                  events={snapshot.events}
                  names={names}
                  privacy={privacy()}
                />
                <InKindNotes
                  notes={((computed) => (computed.ok ? computed.value.notes : []))(report())}
                  events={snapshot.events}
                  names={names}
                  privacy={privacy()}
                />
                {renta()}
              </div>
            </Show>
          </>
        );
      }}
    </RequireLedger>
  );
}
