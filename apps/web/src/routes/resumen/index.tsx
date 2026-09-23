// "¿Cómo va y hay algo que hacer?" — the screen the application is opened for.
//
// Reading order: how much I have → what needs action → what happened lately
// → how it got here (docs/design/system.md §7.2). On a phone the first
// screenful holds the total, its three books and the first warnings; on a wide
// screen the patrimony is a band, attention and the recent movements share a
// row, and the evolution closes the page (D5).
//
// Every figure comes from a projection of the domain **at today's date**
// (`asOf`, Q11), the same one `atlas networth` uses without `--date`, and the
// recent movements are cut at that date too: a valuation dated next month is
// not something that happened lately.
//
// An empty ledger shows its first steps (D4) until the first purchase.

import {
  coreWeights,
  integrity,
  type LedgerEntry,
  ledgerEntries,
  netWorth,
  netWorthSeries,
  pendingOrders,
  settingsAt,
  transferWatch,
} from "@atlas/domain";
import { A } from "@solidjs/router";
import { For, type JSX, lazy, Show } from "solid-js";
import { SeriesCard } from "../../components/chart/index.js";
import { Icon, Notice, Section } from "../../components/index.js";
import { formatLongDate } from "../../format/date.js";
import { eventReferences } from "../../format/events.js";
import { nameIndex } from "../../format/names.js";
import { daysSinceExport } from "../../ledger/source.js";
import { store, today } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import {
  attentionItems,
  movementRows,
  netWorthView,
  onboardingOf,
} from "../../view-models/index.js";
import { netWorthPlot } from "../../view-models/series.js";
import { RequireLedger } from "../guard.jsx";
import { MovementLine } from "../movimientos/MovementLine.jsx";
import { AttentionBlock } from "./AttentionBlock.jsx";
import { FirstSteps } from "./FirstSteps.jsx";
import { NetWorthBlock } from "./NetWorthBlock.jsx";

/**
 * The card that leads to the fiscal screen, loaded **after** the summary: it
 * is the only card that asks the tax engine anything, and the engine is not on
 * the boot path.
 */
const FiscalCard = lazy(() => import("./FiscalCard.jsx"));

/** How many recent movements the summary shows (prompt §3.6). */
const RECENT = 5;

/** Enough points for a curve, few enough that twenty years stay instant. */
const MAX_POINTS = 120;

/** What sets the ledger up without moving anything: it is not a movement. */
const SETUP = new Set([
  "account_created",
  "account_updated",
  "asset_created",
  "asset_updated",
  "settings_changed",
]);

const isMovement = (entry: LedgerEntry): boolean => !SETUP.has(entry.event.type);

export default function ResumenRoute(): JSX.Element {
  return (
    <RequireLedger skeleton={6}>
      {(snapshot) => {
        const date = today();
        const dated = store.projectionAt(date) ?? snapshot.state;
        // The catalogue, once per render: every block below names its things.
        const names = nameIndex(snapshot.state);
        const settings = settingsAt(dated, date).settings;
        const worth = netWorth(dated, date, settings);
        const weights = coreWeights(dated, date, settings);
        // `transferWatch`, not `pendingTransfers`: it is the one that applies
        // `transfer_max_days` and emits `transfer_overdue`. Reading the plain
        // query here left the rule computed and never shown.
        const transfers = transferWatch(dated, date, settings);
        const source = store.source();
        const overdueDays =
          source?.kind === "browser"
            ? (daysSinceExport(source, date) ?? ("never" as const))
            : undefined;
        const items = attentionItems({
          invalidCount: snapshot.state.invalid.length,
          warnings: [
            ...dated.warnings,
            ...weights.warnings,
            ...worth.warnings,
            ...transfers.warnings,
          ],
          findings: integrity(snapshot.state).filter((finding) => finding.severity === "error"),
          openOrders: pendingOrders(dated, date),
          openTransfers: transfers.rows,
          ...(overdueDays === undefined || (overdueDays !== "never" && overdueDays <= 7)
            ? {}
            : { exportOverdueDays: overdueDays }),
          names,
          privacy: store.privacy(),
          date,
          saleDates: new Map(dated.gains.map((gain) => [gain.event_id, gain.fiscal_date])),
        });
        // Cut at the date read: what is dated later has not happened yet.
        const entries = ledgerEntries(snapshot.state, snapshot.events, { to: date });
        const recent = movementRows(
          entries.filter(isMovement).slice(0, RECENT),
          names,
          eventReferences(snapshot.events, names),
        );
        const onboarding = onboardingOf(dated, entries, settings);
        const moved = entries.some(isMovement);
        const series = netWorthPlot(
          netWorthSeries(snapshot.events, { to: date, max_points: MAX_POINTS }),
          names,
        );

        return (
          <>
            <PageHeader title="Resumen" lead={formatLongDate(date)} />

            <div class="grid">
              <Show when={onboarding}>{(steps) => <FirstSteps onboarding={steps()} />}</Show>

              <Show when={moved}>
                <NetWorthBlock view={netWorthView(worth, names)} />
                <AttentionBlock items={items} />
                <Section title="Últimos movimientos" class="span-5" label="Últimos movimientos">
                  <ul class="rows">
                    <For each={recent}>
                      {(row) => (
                        <li>
                          <MovementLine row={row} />
                        </li>
                      )}
                    </For>
                  </ul>
                  <A href="/movimientos" class="card-foot">
                    <span>Ver todos los movimientos</span>
                    <Icon name="chevright" class="icon-sm" />
                  </A>
                </Section>
                <FiscalCard events={snapshot.events} date={date} />
                <SeriesCard
                  title="Evolución del patrimonio"
                  class="span-12"
                  labels={["Cartera principal", "Cubo", "Efectivo"]}
                  colours={["--c-series-core", "--c-series-bucket", "--c-series-cash"]}
                  dashes={[undefined, [6, 4], [1, 5]]}
                  x={series.x}
                  values={series.values}
                  rows={series.rows}
                  missing={series.missing}
                  empty={
                    <Notice severity="info" title="Todavía no hay nada que dibujar">
                      La evolución se dibuja sobre las fechas que tienen precio. Registra una
                      valoración y aparecerá el primer punto.
                    </Notice>
                  }
                />
              </Show>
            </div>
          </>
        );
      }}
    </RequireLedger>
  );
}
