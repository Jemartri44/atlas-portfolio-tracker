// "¿Y si quiero acercarme a los pesos objetivo?" — the rebalance button (feature 028).
//
// A proposal and nothing else: the orders are placed by hand and recorded as
// always. The steps come in the order of what they cost: new money first, then
// transfers between funds (no tax), and last the sales, each with its estimated
// tax and its commissions on the table before anyone decides. The owner stops
// where they want: every step says where the core stands if the plan ends there.
//
// The domain is loaded when the button is pressed, not with the Cartera: it
// carries the tax engine, which the first screen does not need.

import type { ExternalPrices, LedgerEvent, LedgerState, Settings } from "@atlas/domain";
import { createEffect, createMemo, createSignal, For, type JSX, on, Show } from "solid-js";
import {
  Amount,
  ErrorView,
  Field,
  Figure,
  Notice,
  Pending,
  Section,
  Tag,
} from "../../components/index.js";
import { describeWarning } from "../../format/messages/warnings.js";
import type { NameIndex } from "../../format/names.js";
import { attempt } from "../../ledger/query.js";
import type { AppError } from "../../ledger/state.js";
import { privacy } from "../../shell/preferences.js";
import {
  type RebalanceView,
  rebalanceView,
  type SaleTaxView,
  type StepView,
  typedAmount,
} from "../../view-models/core/index.js";
import { PlatformsBlock } from "./PlatformsBlock.jsx";

/** What fixes each refusal, and where; a refusal with a remedy is a pending datum, not an error. */
const REMEDIES: Record<string, { label: string; to: string }> = {
  missing_manual_prices: { label: "Registrar una valoración", to: "/registrar/valuation" },
  missing_target_weights: { label: "Fijar los pesos objetivo", to: "/ajustes/configuracion" },
  no_target_weight_in_table: { label: "Revisar los pesos objetivo", to: "/ajustes/configuracion" },
  missing_deviation_threshold: {
    label: "Fijar el umbral de desviación",
    to: "/ajustes/configuracion",
  },
};

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

const Step = (props: { step: StepView }): JSX.Element => (
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

const Result = (props: {
  view: RebalanceView;
  names: NameIndex;
  state: LedgerState;
}): JSX.Element => (
  <>
    <ul class="rows" aria-label="Desviación de cada activo">
      <For each={props.view.diagnosis}>
        {(row) => (
          <li>
            <div class="row">
              <span class="main">
                <span class="title truncate" title={row.name}>
                  {row.name}
                </span>
                <span class="sub">
                  {row.assetClass} · objetivo{" "}
                  <Figure value={row.targetPct} unit="percent" decimals="auto" />
                </span>
              </span>
              <span class="figs">
                <span class="fig">
                  <Figure value={row.weightPct} unit="percent" decimals={1} />
                </span>
                <span class="fig-sub">
                  <Figure value={row.deviationPp} unit="points" decimals={1} />{" "}
                  <Show when={row.beyondThreshold}>
                    <Tag tone="caution">fuera del umbral</Tag>
                  </Show>
                </span>
              </span>
            </div>
          </li>
        )}
      </For>
    </ul>
    <Show when={props.view.status === "within_threshold"}>
      <Notice severity="info" title="No hace falta rebalancear">
        Ningún activo supera el umbral de{" "}
        <Figure value={props.view.thresholdPp} unit="points" decimals="auto" />
        {props.view.newMoney.amount.isPositive() ? " una vez colocado el dinero nuevo" : ""}. La
        regla 3 del plan pide revisar una vez al año.
      </Notice>
    </Show>
    <Show when={props.view.status === "only_deficits"}>
      <Notice severity="info" title="Nada que traspasar ni vender">
        Hay activos por debajo de su objetivo más allá del umbral, pero ninguno por encima: se
        corrige aportando.
        <Show when={props.view.purchasesOnly}>
          {(only) => (
            <>
              {" "}
              Llevar todos al objetivo solo con compras exigiría <Amount value={only()} /> más.
            </>
          )}
        </Show>
      </Notice>
    </Show>
    <ol class="steps" aria-label="Pasos del rebalanceo">
      <For each={props.view.steps}>{(step) => <Step step={step} />}</For>
    </ol>
    <Show when={props.view.cash.length > 0}>
      <h3 class="block-title">Efectivo entre plataformas</h3>
      <ul class="rows" aria-label="Efectivo entre plataformas">
        <For each={props.view.cash}>
          {(move) => (
            <li>
              <div class="row">
                <span class="main">
                  <span class="title">{move.platform}</span>
                  <span class="sub">
                    compras <Amount value={move.buy} /> · ventas <Amount value={move.sell} /> ·
                    comisiones <Amount value={move.fees} />
                  </span>
                </span>
                <span class="figs">
                  <span class="fig">
                    <Amount value={move.net} signed />
                  </span>
                </span>
              </div>
            </li>
          )}
        </For>
      </ul>
      <p class="card-note">
        Positivo: tiene que llegar dinero a esa plataforma; negativo: queda libre.
      </p>
    </Show>
    <For each={props.view.warnings}>
      {(warning) => (
        <Notice severity="caution">
          {describeWarning(warning, { names: props.names, privacy: privacy() })}
        </Notice>
      )}
    </For>
  </>
);

interface RebalanceCardProps {
  state: LedgerState;
  events: readonly LedgerEvent[];
  date: string;
  settings: Settings;
  external: ExternalPrices | undefined;
  names: NameIndex;
}

export const RebalanceCard = (props: RebalanceCardProps): JSX.Element => {
  const [amountText, setAmountText] = createSignal("");
  const [outcome, setOutcome] = createSignal<
    { ok: true; value: RebalanceView } | { ok: false; error: AppError } | undefined
  >(undefined);
  const [busy, setBusy] = createSignal(false);
  const typed = createMemo(() => typedAmount(amountText()));
  const amountError = (): string | undefined => {
    const value = typed();
    return value.kind === "invalid" ? value.message : undefined;
  };

  // A proposal belongs to the date it was computed at.
  createEffect(
    on(
      () => props.date,
      () => setOutcome(undefined),
      { defer: true },
    ),
  );

  const run = async (): Promise<void> => {
    const money = typed();
    if (money.kind === "invalid") {
      return;
    }
    setBusy(true);
    const { rebalancePlan } = await import("@atlas/domain/rebalance");
    setOutcome(
      attempt(() =>
        rebalanceView(
          rebalancePlan(props.state, props.events, {
            date: props.date,
            settings: props.settings,
            ...(money.kind === "amount" ? { amount: money.value } : {}),
            ...(props.external === undefined ? {} : { external: props.external }),
          }),
          props.names,
        ),
      ),
    );
    setBusy(false);
  };

  const failure = () => {
    const value = outcome();
    return value?.ok === false ? value.error : undefined;
  };
  const view = () => {
    const value = outcome();
    return value?.ok === true ? value.value : undefined;
  };

  return (
    <Section title="Rebalancear" class="span-12" aside={<Tag tone="accent">Propuesta</Tag>}>
      <p class="card-note">
        Propone cómo acercarte a los pesos objetivo: primero con dinero nuevo, después con traspasos
        entre fondos (sin impuestos) y, solo si hace falta, con ventas, enseñándote antes el
        impuesto aproximado y las comisiones. El cubo no entra. Nada se registra.
      </p>
      <Field
        id="rebalance-amount"
        kind="decimal"
        unit="€"
        label="Dinero nuevo para el núcleo (opcional)"
        placeholder="Nada"
        hint="Ya sin la parte del cubo. No se guarda."
        value={amountText()}
        error={amountError()}
        onInput={setAmountText}
      />
      <button type="button" disabled={busy() || amountError() !== undefined} onClick={run}>
        {busy() ? "Calculando…" : "Calcular rebalanceo"}
      </button>
      <Show when={failure()}>
        {(error) => (
          <Show
            when={REMEDIES[error().code]}
            fallback={<ErrorView error={error()} title="No se puede calcular el rebalanceo" />}
          >
            {(remedy) => <Pending action={remedy()}>{error().message}</Pending>}
          </Show>
        )}
      </Show>
      <Show when={view()}>
        {(result) => <Result view={result()} names={props.names} state={props.state} />}
      </Show>
    </Section>
  );
};
