// The steps of a rebalance, one by one (feature 028): what each does, what it costs
// and where the core stands if the plan stops there.

import { For, type JSX, Show } from "solid-js";
import { Amount, Figure, Notice, Tag } from "../../components/index.js";
import type { SaleTaxView, StepView } from "../../view-models/core/index.js";
import { PlatformsBlock } from "./PlatformsBlock.jsx";

const Tax = (props: { tax: SaleTaxView }): JSX.Element => (
  <Show
    when={props.tax.kind === "estimated" ? props.tax : undefined}
    fallback={
      <p class="card-note" data-testid="tax">
        Impuesto: no se puede estimar ({props.tax.kind === "unavailable" ? props.tax.code : ""}).
        Decide sin esa cifra o repara primero lo que dice.
      </p>
    }
  >
    {(tax) => (
      <>
        <p class="card-note" data-testid="tax">
          <Show
            when={tax().tax}
            fallback="Impuesto: no calculable, faltan los tramos de la base del ahorro en Ajustes."
          >
            {(amount) => (
              <>
                Impuesto aproximado: <Amount value={amount()} /> sobre{" "}
                {tax().isLoss ? "una pérdida" : "una ganancia"} de <Amount value={tax().gain} />.
              </>
            )}
          </Show>{" "}
          Estimación al precio de hoy con los lotes FIFO; no es la liquidación.
        </p>
        <ul class="rows" aria-label="Lotes que consume la venta">
          <For each={tax().lots}>
            {(lot) => (
              <li>
                <div class="row">
                  <span class="main">
                    <span class="title">Lote del {lot.acquired}</span>
                    <span class="sub">
                      coste <Amount value={lot.cost} />
                    </span>
                  </span>
                  <span class="figs">
                    <span class="fig">
                      <Amount value={lot.gain} signed coloured />
                    </span>
                  </span>
                </div>
              </li>
            )}
          </For>
        </ul>
        <Show when={tax().deferred}>
          {(deferred) => (
            <Notice severity="caution" title="Parte de la pérdida no sería deducible">
              La regla de recompra difiere <Amount value={deferred().amount} />. No recompres este
              valor antes del {deferred().until} o la pérdida seguirá sin ser deducible.
            </Notice>
          )}
        </Show>
      </>
    )}
  </Show>
);

export const Step = (props: { step: StepView }): JSX.Element => (
  <li data-testid="step" data-kind={props.step.kind}>
    <div class="step-head">
      <Tag tone={props.step.kind === "sale" ? "caution" : "done"}>
        {props.step.kind === "sale" ? "Con impuestos · decides tú" : "Sin impuestos"}
      </Tag>{" "}
      <strong>Paso {props.step.index}</strong>
    </div>
    <Show when={props.step.kind === "contribution" ? props.step : undefined}>
      {(step) => (
        <>
          <p class="card-note">
            Dinero nuevo para el núcleo: <Amount value={step().amount} />, repartido como en la
            aportación del mes.
          </p>
          <PlatformsBlock view={step().platforms} />
        </>
      )}
    </Show>
    <Show when={props.step.kind === "transfer" ? props.step : undefined}>
      {(step) => (
        <p class="card-note">
          Traspaso de {step().fromName}
          {step().fromAccount === undefined ? "" : ` (${step().fromAccount})`} a {step().toName}
          {step().toAccount === undefined
            ? " (aún sin cuenta: elige dónde)"
            : ` (${step().toAccount})`}
          : <Amount value={step().amount} />, unas <Amount quantity={step().quantity} of="part." />.
          Conserva la fecha y el coste de los lotes: no es una venta seguida de una compra.
        </p>
      )}
    </Show>
    <Show when={props.step.kind === "sale" ? props.step : undefined}>
      {(step) => (
        <>
          <p class="card-note">
            Vender {step().name}: <Amount value={step().amount} />.
          </p>
          <ul class="rows" aria-label="Órdenes de venta">
            <For each={step().orders}>
              {(order) => (
                <li>
                  <div class="row">
                    <span class="main">
                      <span class="title">{order.accountId}</span>
                      <span class="sub">
                        <Amount quantity={order.quantity} of="uds." /> ·{" "}
                        <Show when={order.fee} fallback="comisión desconocida">
                          {(fee) => (
                            <>
                              comisión <Amount value={fee()} />
                              <Show when={order.feePct}>
                                {(share) => (
                                  <>
                                    {" "}
                                    (<Figure value={share()} unit="percent" decimals="auto" />)
                                  </>
                                )}
                              </Show>
                            </>
                          )}
                        </Show>
                      </span>
                    </span>
                    <span class="figs">
                      <span class="fig">
                        <Amount value={order.amount} />
                      </span>
                    </span>
                  </div>
                </li>
              )}
            </For>
          </ul>
          <Tax tax={step().tax} />
          <p class="card-note">Con ese dinero se compra:</p>
          <PlatformsBlock view={step().buys} />
        </>
      )}
    </Show>
    <p class="card-note" data-testid="stop-here">
      Si te quedas aquí, la desviación máxima es{" "}
      <Figure value={props.step.maxDeviationPp} unit="points" decimals={1} />.
    </p>
  </li>
);
