// "¿Qué tal va el cubo?" — the speculative bucket, measured against the index
// and against its own budget.
//
// **Nothing of the core appears here** (constitution III), with the one
// exception the budget card carries and labels: the weight of the bucket over
// total net worth (rule 18), which is a budget control and is always shown with
// the breakdown beside it.
//
// The stop-loss warning goes at the very top, as `atlas bucket` does: it is the
// rule the plan wants hardest to ignore. It warns; it never blocks.
//
// Composition (docs/design/system.md §7.6): the bucket against the index, the
// open positions beside the budget, the theses, the costs and the warnings.
// A bucket with nothing in it is one empty state, not six empty cards.

import {
  bucketIndexSeries,
  bucketPositions,
  bucketStats,
  bucketTheses,
  costSummary,
  netWorth,
  settingsAt,
  type Warning,
} from "@atlas/domain";
import { A } from "@solidjs/router";
import { createMemo, For, type JSX, Show } from "solid-js";
import {
  AsOfPicker,
  EmptyState,
  Notice,
  type NoticeItem,
  Section,
  StandaloneFees,
  useAsOf,
} from "../../components/index.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { nameIndex } from "../../format/names.js";
import { store, usePrivacy } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import {
  bucketPositionsView,
  bucketReportView,
  thesesView,
} from "../../view-models/bucket/index.js";
import { costsView } from "../../view-models/core/index.js";
import { attentionDestination, netWorthView } from "../../view-models/index.js";
import { bucketIndexPlot } from "../../view-models/series.js";
import { RequireLedger } from "../guard.jsx";
import { BudgetCard } from "./BudgetCard.jsx";
import { PositionsCard } from "./PositionsCard.jsx";
import { StatsCard } from "./StatsCard.jsx";
import { ThesesCard } from "./ThesesCard.jsx";

const MAX_POINTS = 120;

/**
 * What a card of this screen already says where it happens: the missing price
 * in its cell, the rule that could not be evaluated under its heading, the
 * sample and the index in the statistics. A list of notices repeating them was
 * a second copy of the screen (review of 2026-09-19); what is left goes into
 * the card it is about.
 */
const SAID_IN_PLACE = new Set([
  "bucket_stop_loss_reached",
  "bucket_stop_loss_not_evaluated",
  "bucket_weight_not_evaluated",
  "bucket_sample_too_small",
  "bucket_contaminated_theses",
  "missing_benchmark_price",
  "missing_prices",
  "partial_bucket_total",
  "stale_price",
]);

export default function CuboRoute(): JSX.Element {
  const asOf = useAsOf();
  const privacy = usePrivacy();

  return (
    <RequireLedger skeleton={8}>
      {(snapshot) => {
        const names = nameIndex(snapshot.state);
        const date = (): string => asOf.date();
        const dated = () => store.projectionAt(date()) ?? snapshot.state;
        const settings = () => settingsAt(dated(), date()).settings;

        const positions = createMemo(() =>
          bucketPositionsView(bucketPositions(dated(), date(), settings()), names),
        );
        const theses = createMemo(() =>
          thesesView(bucketTheses(dated(), date(), settings()), names),
        );
        const report = createMemo(() =>
          bucketReportView(
            bucketStats(dated(), snapshot.events, date(), settings(), date()),
            names,
          ),
        );
        const worth = createMemo(() => netWorthView(netWorth(dated(), date(), settings()), names));
        // Only the **bucket's** standalone charges: the core's are on `/cartera`
        // with the core's own total, and the two never share one.
        const fees = createMemo(
          () =>
            costsView(costSummary(dated(), snapshot.events, date(), settings(), date()), names)
              .standalone.bucket,
        );
        const series = createMemo(() =>
          bucketIndexPlot(
            bucketIndexSeries(snapshot.events, { to: date(), max_points: MAX_POINTS }),
          ),
        );

        /** The stop rule breached: top of the screen, not a corner. */
        const stopLoss = () =>
          report().controls.warnings.filter(
            (warning) => warning.code === "bucket_stop_loss_reached",
          );
        /** Each warning where it is fixed, the same notice as everywhere else. */
        const noticesOf = (warnings: readonly Warning[]): NoticeItem[] =>
          warnings
            .filter((warning) => !SAID_IN_PLACE.has(warning.code))
            .map((warning) => ({
              severity: "caution",
              message: describeWarning(warning, { names, privacy: privacy() }),
              // What is fixed on this very screen carries no link to itself.
              action: ((to) => (to?.to === "/cubo" ? undefined : to))(
                attentionDestination(warning.code) ?? {
                  label: "Ver movimientos",
                  to: "/movimientos",
                },
              ),
            }));
        /** Nothing ever happened in the bucket: no thesis, no position, not a euro put in. */
        const empty = () =>
          positions().rows.length === 0 &&
          theses().rows.length === 0 &&
          report().stats.closedTheses === 0 &&
          report().controls.contributionGross.isZero();

        return (
          <>
            <PageHeader
              title="Cubo"
              actions={
                <AsOfPicker
                  date={date()}
                  isToday={asOf.isToday()}
                  onChange={asOf.set}
                  hint="Corta todos tus datos por esa fecha: cantidades, precios, tesis y avisos."
                />
              }
            />

            <Show
              when={!empty()}
              fallback={
                <div class="card">
                  <EmptyState
                    glyph="bucket"
                    what="El cubo está vacío."
                    why="Cada compra del cubo empieza por una tesis: qué esperas, en qué plazo y qué te diría que te equivocas."
                  >
                    <A href="/registrar/tesis" role="button">
                      Abrir una tesis
                    </A>
                  </EmptyState>
                </div>
              }
            >
              <div class="grid">
                <For each={stopLoss()}>
                  {(warning) => (
                    <div class="span-12">
                      <Notice severity="danger" title="Regla de parada">
                        {describeWarning(warning, { names, privacy: privacy() })}
                      </Notice>
                    </div>
                  )}
                </For>

                <StatsCard view={report().stats} plot={series()} />
                <PositionsCard view={positions()} />
                <BudgetCard
                  notices={noticesOf(report().controls.warnings)}
                  view={report().controls}
                  worth={worth()}
                  limits={{
                    stopLossPct: settings().bucket_stop_loss_pct,
                    maxWeightPct: settings().bucket_max_weight_pct,
                  }}
                />
                <ThesesCard
                  view={theses()}
                  notices={noticesOf([
                    ...theses().warnings,
                    ...positions().warnings,
                    ...report().stats.warnings,
                  ])}
                />

                <Show when={fees().rows.length > 0}>
                  <Section title="Costes del cubo" class="span-12">
                    <StandaloneFees
                      view={fees()}
                      totalLabel="Total de comisiones sueltas del cubo"
                    />
                  </Section>
                </Show>
              </div>
            </Show>
          </>
        );
      }}
    </RequireLedger>
  );
}
