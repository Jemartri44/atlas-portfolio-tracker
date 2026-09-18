// "¿Cómo va y hay algo que hacer?" — the screen the application is opened for.
//
// Reading order: how much I have → what needs action → what happened lately,
// which is the order the personal-finance applications worth respecting use
// (research.md §5). At 360px the first screenful holds the total, its three
// subtotals and the number of warnings.
//
// Every figure comes from a projection of the domain **at today's date**
// (`asOf`, Q11), the same one `atlas networth` uses without `--date`.

import {
  coreWeights,
  integrity,
  ledgerEntries,
  netWorth,
  pendingOrders,
  settingsAt,
  transferWatch,
} from "@atlas/domain";
import { A } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { Callout, EmptyState } from "../../components/index.js";
import { eventReferences } from "../../format/events.js";
import { displayName, nameIndex } from "../../format/names.js";
import { daysSinceExport } from "../../ledger/source.js";
import { store, today } from "../../ledger/state.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { attentionItems, movementRows, netWorthView } from "../../view-models/index.js";
import { RequireLedger } from "../guard.jsx";
import { MovementList } from "../movimientos/MovementList.jsx";
import { AttentionBlock } from "./AttentionBlock.jsx";
import { NetWorthBlock } from "./NetWorthBlock.jsx";

/** How many recent movements the summary shows (prompt §3.6). */
const RECENT = 5;

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
        });
        const recent = movementRows(
          ledgerEntries(snapshot.state, snapshot.events).slice(0, RECENT),
          names,
          eventReferences(snapshot.events),
        );
        const empty = snapshot.events.length === 0;

        return (
          <>
            <PageHeader title="Resumen" />

            <Show
              when={!empty}
              fallback={
                <EmptyState what="El libro está vacío.">
                  <p class="subtle flush">
                    Empieza dando de alta la cuenta donde inviertes y el primer activo; después ya
                    puedes registrar una compra.
                  </p>
                  <A href="/registrar/cuenta" role="button">
                    Dar de alta una cuenta
                  </A>
                </EmptyState>
              }
            >
              <div class="stack">
                <NetWorthBlock view={netWorthView(worth, names)} />
                <AttentionBlock items={items} />
                <section class="card" aria-label="Últimos movimientos">
                  <header>
                    <h2>Últimos movimientos</h2>
                    <A href="/movimientos">Ver el libro</A>
                  </header>
                  <Show
                    when={recent.length > 0}
                    fallback={<p class="subtle">Todavía no hay movimientos.</p>}
                  >
                    <MovementList rows={recent} />
                  </Show>
                </section>
                <Show when={weights.partial && weights.missing_prices.length > 0}>
                  <Callout tone="info" title="Los pesos del núcleo no se han podido calcular">
                    Faltan precios de{" "}
                    {weights.missing_prices.map((id) => displayName(names, id)).join(", ")} a {date}
                    . Los pesos no se calculan sobre un total parcial.
                  </Callout>
                </Show>
              </div>
            </Show>
          </>
        );
      }}
    </RequireLedger>
  );
}
