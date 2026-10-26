// What to do on each platform (feature 028): what to buy there, what the account
// already holds in cash, the commissions and what is left to deposit.
//
// The commission is the owner's own: the one the last equivalent trade paid, with
// its date said out loud. When the ledger has none it says «desconocida» and never
// shows a zero, because an invented zero would make the deposit fall short.

import { For, type JSX, Show } from "solid-js";
import { Amount, Figure, Notice } from "../../components/index.js";
import type { PlatformRowView, PlatformsView } from "../../view-models/core/index.js";

const Row = (props: { row: PlatformRowView }): JSX.Element => (
  <div class="platform" data-testid="platform">
    <h4 class="block-title">
      {props.row.platform} <span class="meta">({props.row.accountId})</span>
    </h4>
    <dl class="kpis">
      <div class="kpi">
        <dt>Comprar</dt>
        <dd>
          <Amount value={props.row.buy} class="kpi-amount" />
        </dd>
      </div>
      <div class="kpi">
        <dt>Ya tiene</dt>
        <dd>
          <Show when={!props.row.foreignCurrency} fallback="otra divisa">
            <Amount value={props.row.cash} class="kpi-amount" />
          </Show>
        </dd>
      </div>
      <div class="kpi">
        <dt>Ingresar</dt>
        <dd data-testid="deposit">
          <Amount value={props.row.deposit} class="kpi-amount" />
        </dd>
      </div>
    </dl>
    <ul class="rows" aria-label={`Órdenes en ${props.row.platform}`}>
      <For each={props.row.lines}>
        {(line) => (
          <li>
            <div class="row">
              <span class="main">
                <span class="title truncate" title={line.name}>
                  {line.name}
                </span>
                <span class="sub" data-testid="fee">
                  <Show when={line.fee} fallback="comisión desconocida">
                    {(fee) => (
                      <>
                        comisión <Amount value={fee()} />
                        <Show when={line.feePct}>
                          {(share) => (
                            <>
                              {" "}
                              (<Figure value={share()} unit="percent" decimals="auto" />)
                            </>
                          )}
                        </Show>{" "}
                        · {line.feeNote}
                      </>
                    )}
                  </Show>
                </span>
              </span>
              <span class="figs">
                <span class="fig">
                  <Amount value={line.amount} />
                </span>
              </span>
            </div>
          </li>
        )}
      </For>
    </ul>
    <Show when={props.row.cashNegative}>
      <p class="card-note">
        El efectivo del libro es negativo (faltan ingresos por registrar): se pide solo lo que se
        compra.
      </p>
    </Show>
    <Show when={props.row.unknownFees.length > 0}>
      <p class="card-note" data-testid="unknown-fees">
        Sin comisión conocida para {props.row.unknownFees.join(", ")}: el ingreso puede quedarse
        corto.
      </p>
    </Show>
    <Show when={props.row.costliest}>
      {(name) => (
        <p class="card-note">La comisión que más pesa sobre su importe es la de {name()}.</p>
      )}
    </Show>
  </div>
);

export const PlatformsBlock = (props: { view: PlatformsView }): JSX.Element => (
  <>
    <For each={props.view.rows}>{(row) => <Row row={row} />}</For>
    <For each={props.view.unassigned}>
      {(order) => (
        <Notice severity="caution" title={`${order.name} no está en ninguna cuenta`}>
          Hay <Amount value={order.amount} /> para comprarlo y ninguna cuenta activa del núcleo lo
          tiene. Elige dónde en {order.candidates.join(", ") || "tus cuentas"} y regístralo allí.
        </Notice>
      )}
    </For>
  </>
);
