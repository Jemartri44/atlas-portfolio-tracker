// The result of pressing «Calcular rebalanceo»: the deviation of every asset, the steps
// and the cash that moves between platforms (feature 028).

import { For, type JSX, Show } from "solid-js";
import { Amount, Figure, Notice, Tag } from "../../components/index.js";
import { describeWarning } from "../../format/messages/warnings.js";
import type { NameIndex } from "../../format/names.js";
import { privacy } from "../../shell/preferences.js";
import type { RebalanceView } from "../../view-models/core/index.js";
import { Step } from "./RebalanceSteps.jsx";

export const Result = (props: { view: RebalanceView; names: NameIndex }): JSX.Element => (
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
    <ol class="rebalance-steps" aria-label="Pasos del rebalanceo">
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
