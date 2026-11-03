// "¿Qué tengo que declarar?" — the fiscal screen (docs/design/system.md §7.8): a destination of
// the bar on a computer, reached from the summary on a phone. Everything comes from the domain, in
// a lazily loaded chunk: the tax engine never reaches the boot path. A computer reads the return of
// the year first; a phone, the deadlines and the informative models, then the return.

import { settingsAt, yearOf } from "@atlas/domain";
import { informativeReturn, repurchaseCalendar, taxBoxes, taxYear } from "@atlas/domain/fiscal";
import { createMemo, createResource, For, type JSX, Show } from "solid-js";
import { nameIndex } from "../../format/names.js";
import { toAppError } from "../../ledger/errors.js";
import { attempt } from "../../ledger/query.js";
import { store, today } from "../../ledger/state.js";
import { useQuotes } from "../../prices/use-quotes.jsx";
import { GRID, mediaQuery } from "../../shell/media.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { privacy } from "../../shell/preferences.js";
import { boxesView, informativeView, yearView } from "../../view-models/fiscal/index.js";
import { repurchaseView } from "../../view-models/fiscal/sale.js";
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
import { RateNotes } from "./RateNotes.jsx";
import { RepurchaseCard } from "./RepurchaseCard.jsx";
import { SaleSimulatorCard } from "./SaleSimulatorCard.jsx";
import { useYear, type YearChoice, YearPicker } from "./YearPicker.jsx";
import { yearsOf } from "./years.js";

/** What sets a ledger up without moving anything: with only these, the screen is `NothingYet`. */
const SETUP = new Set([
  "account_created",
  "account_updated",
  "asset_created",
  "asset_updated",
  "settings_changed",
]);

export default function FiscalRoute(): JSX.Element {
  return (
    <RequireLedger skeleton={8}>
      {(snapshot) => {
        const names = nameIndex(snapshot.state);
        const wide = mediaQuery(GRID);
        // Informative prices, only for the "what if I sell" estimate: no figure of the return uses them.
        const prices = useQuotes(snapshot.state);
        const current = yearOf(today());
        const filings = [...snapshot.state.filings.values()];
        const choices = createMemo<YearChoice[]>(() =>
          yearsOf(
            [...snapshot.state.gains, ...snapshot.state.externalIncome],
            filings,
            current,
          ).map((year) => ({
            year,
            filed: filings.some(
              (filing) =>
                filing.model === "renta" &&
                filing.tax_year === year &&
                filing.superseded_by === undefined,
            ),
          })),
        );
        const picked = useYear(() => current - 1);
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
        const report = createMemo(() => {
          try {
            return { ok: true as const, value: taxYear(snapshot.events, year(), options()) };
          } catch (error) {
            return { ok: false as const, error: toAppError(error) };
          }
        });
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
        const untouched = snapshot.events.every((event) => SETUP.has(event.type));
        /** The return of the year: the base, the criteria, the losses, the boxes, what was filed. */
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
                <Show when={!year().empty}>
                  <BaseCard view={year()} />
                  <Show when={quota()}>
                    {(estimate) => <EstimateCards estimate={estimate()} />}
                  </Show>
                  <DoubtfulCard stakes={year().doubtful} />
                  <SettledCard stakes={year().settled} />
                  <LossesCard
                    year={year().year}
                    pending={year().pending}
                    expired={year().expired}
                    expiring={year().expiring}
                    anchors={year().anchors}
                  />
                  {boxesCard()}
                </Show>
                <SaleSimulatorCard
                  state={snapshot.state}
                  events={snapshot.events}
                  date={today()}
                  settings={settingsAt(snapshot.state, today()).settings}
                  external={prices.external(snapshot.state)}
                />
                <FilingCard
                  year={picked.year()}
                  {...(filing() === undefined ? {} : { filing: filing() })}
                  quiet={year().empty}
                />
              </>
            )}
          </Show>
        );
        const models = (): JSX.Element => (
          <Show when={store.invalidCount() === 0}>
            <For each={informative()}>
              {({ model, outcome }) =>
                outcome.ok ? (
                  <InformativeCard view={outcome.value} />
                ) : (
                  <PartFailed title={`Modelo ${model}`} error={outcome.error} half />
                )
              }
            </For>
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
                <Show when={wide()} fallback={[models(), renta()]}>
                  {renta()}
                  {models()}
                </Show>
              </div>
            </Show>
          </>
        );
      }}
    </RequireLedger>
  );
}
