// "¿Qué tengo que declarar?" — the fiscal screen.
//
// It is opened a handful of times a year, so it is **not** a sixth destination
// of the navigation: it has its own address and is reached from a card of
// the summary and from Ajustes. Everything it shows comes from the domain —
// the base, the boxes, the informative returns and what each figure leans on —
// and the whole of it is a lazily loaded chunk: the tax engine never reaches
// the boot path.
//
// Reading order: which year, what the base is and where it comes from, what is
// not settled, what is pending, the boxes, the informative returns and what
// was filed.

import { yearOf } from "@atlas/domain";
import { informativeReturn, taxBoxes, taxYear } from "@atlas/domain/fiscal";
import { A } from "@solidjs/router";
import { createMemo, createResource, For, type JSX, Show } from "solid-js";
import { EmptyState, Notice, Section } from "../../components/index.js";
import { nameIndex } from "../../format/names.js";
import { toAppError } from "../../ledger/errors.js";
import { attempt } from "../../ledger/query.js";
import { store, today } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { privacy } from "../../shell/preferences.js";
import { boxesView, informativeView, yearView } from "../../view-models/fiscal/index.js";
import { RequireLedger } from "../guard.jsx";
import { BaseCard } from "./BaseCard.jsx";
import { BoxesCard } from "./BoxesCard.jsx";
import { LedgerCalendar } from "./CalendarCard.jsx";
import { DoubtfulCard, SettledCard } from "./CriteriaCards.jsx";
import { FilingCard } from "./FilingCard.jsx";
import { InformativeCard } from "./InformativeCard.jsx";
import { LossesCard } from "./LossesCard.jsx";
import { PartFailed } from "./PartFailed.jsx";
import { RateNotes } from "./RateNotes.jsx";
import { useYear, type YearChoice, YearPicker } from "./YearPicker.jsx";
import { yearsOf } from "./years.js";

/**
 * What sets a ledger up without moving anything. A ledger that only has these has nothing to
 * declare and nothing to say about it, so the screen is **one** empty state with the next step and
 * not six cards of zeros (un único estado vacío con el siguiente paso").
 */
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
        const current = yearOf(today());
        const filings = [...snapshot.state.filings.values()];
        const choices = createMemo<YearChoice[]>(() =>
          yearsOf(snapshot.state.gains, filings, current).map((year) => ({
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
            <BoxesCard view={result.value} />
          ) : (
            <PartFailed title="Tu declaración por casillas" error={result.error} />
          );
        };
        const view = createMemo(() => {
          const computed = report();
          return computed.ok ? yearView(computed.value, names) : undefined;
        });
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
              <div class="grid">
                <Section title="Todavía no hay nada que declarar" class="span-12">
                  <EmptyState
                    what="Tu libro no tiene ninguna operación"
                    why="En cuanto registres una compra, una venta o un dividendo, aquí verás la base del ahorro del ejercicio, las casillas del Modelo 100 y si te toca el Modelo 720."
                    glyph="plus"
                  >
                    <A href="/registrar" role="button">
                      Registrar la primera operación
                    </A>
                  </EmptyState>
                </Section>
              </div>
            </Show>

            <Show
              when={!untouched && report().ok}
              fallback={
                <Show when={!untouched}>
                  <Notice
                    severity="danger"
                    title="No se puede calcular tu declaración"
                    action={
                      <A href="/ajustes/verificacion" role="button">
                        Ver la verificación
                      </A>
                    }
                  >
                    {failure()?.message ?? ""}
                  </Notice>
                </Show>
              }
            >
              <div class="grid">
                <LedgerCalendar events={snapshot.events} today={today()} names={names} />
                <RateNotes
                  notes={((computed) => (computed.ok ? computed.value.notes : []))(report())}
                  events={snapshot.events}
                  names={names}
                  privacy={privacy()}
                />
                <Show when={view()}>
                  {(year) => (
                    <>
                      <Show when={year().empty}>
                        <Section title={`Ejercicio ${year().year}`} class="span-12">
                          <EmptyState
                            what="No hay nada que declarar en este ejercicio"
                            why="No se ha vendido nada, no han llegado rendimientos y no arrastras pérdidas. La base del ahorro es cero."
                            glyph="check"
                          />
                        </Section>
                      </Show>
                      <Show when={!year().empty}>
                        <BaseCard view={year()} />
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
                      <FilingCard
                        year={picked.year()}
                        {...(filing() === undefined ? {} : { filing: filing() })}
                        quiet={year().empty}
                      />
                    </>
                  )}
                </Show>
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
              </div>
            </Show>
          </>
        );
      }}
    </RequireLedger>
  );
}
