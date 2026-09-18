// The budget of the bucket and its two control rules (17 and 18).
//
// **This is one of the two bounded exceptions to compartmentalisation**
// (constitution III): the weight of the bucket is measured over *total* net
// worth, which adds the two books together. It travels labelled as what it is —
// a budget control, not a portfolio metric — and the breakdown is shown right
// beside it, never a single undecomposed number.
//
// A rule that could not be measured says **"no se ha podido evaluar"**. Not
// "within limits": the absence of a measurement is not a pass.

import { For, type JSX, Show } from "solid-js";
import { Amount, Badge, Callout, Figure, Section } from "../../components/index.js";
import type { ControlsView } from "../../view-models/bucket/index.js";
import type { NetWorthView } from "../../view-models/index.js";

const Line = (props: { label: string; children: JSX.Element }): JSX.Element => (
  <div class="spread stat-line">
    <span class="subject">{props.label}</span>
    <span class="row">{props.children}</span>
  </div>
);

export const BudgetCard = (props: { view: ControlsView; worth: NetWorthView }): JSX.Element => (
  <Section title="Presupuesto y control del cubo">
    <Line label="Aporte bruto acumulado">
      <>
        <Amount value={props.view.contributionGross} />
        <Show when={props.view.budget !== undefined}>
          <span class="tiny">
            de <Amount value={props.view.budget} currency={false} /> previstos
            <Show when={props.view.monthsElapsed !== undefined}>
              {" "}
              ({props.view.monthsElapsed} meses)
            </Show>
          </span>
        </Show>
      </>
    </Line>
    <Line label="Resultado realizado">
      <Amount value={props.view.realized} signed coloured currency={false} />
    </Line>
    <Line label="Resultado latente">
      <Amount
        value={props.view.unrealized}
        signed
        coloured
        currency={false}
        missingReason="falta el precio de alguna posición"
      />
    </Line>

    <h3 class="block-title">Regla de parada (17)</h3>
    <Show
      when={props.view.lossUnavailable === undefined}
      fallback={
        <p class="note flush">
          <Badge tone="warning">no evaluada</Badge> {props.view.lossUnavailable}. Sin ese dato no
          hay control de pérdida acumulada; no es que no la haya.
        </p>
      }
    >
      <Line label="Pérdida acumulada sobre el aporte">
        <Figure value={props.view.lossPct} unit="percent" coloured />
      </Line>
    </Show>

    <h3 class="block-title">Regla de recogida (18)</h3>
    <Callout tone="info" title="Excepción acotada a la compartimentación">
      El peso del cubo se mide sobre el <strong>patrimonio total</strong>, que suma los dos libros.
      Es un control de presupuesto, no una métrica de cartera, y por eso el desglose va al lado.
    </Callout>
    <Show
      when={props.view.weightUnavailable === undefined}
      fallback={
        <p class="note flush">
          <Badge tone="warning">no evaluada</Badge> {props.view.weightUnavailable}. Sin ese dato no
          hay control de peso del cubo; no es que esté dentro.
        </p>
      }
    >
      <Line label="Peso del cubo sobre el patrimonio total">
        <Figure value={props.view.weightPct} unit="percent" />
      </Line>
    </Show>

    <div class="breakdown">
      <For each={props.worth.blocks}>
        {(block) => (
          <div class="spread stat-line">
            <span class="subject tiny">{block.label}</span>
            <Amount value={block.subtotal} currency={false} />
          </div>
        )}
      </For>
      <div class="spread total-line">
        <span class="subject">
          Patrimonio total
          <Show when={props.worth.partial}>
            {" "}
            <Badge tone="warning">parcial</Badge>
          </Show>
        </span>
        <Amount value={props.worth.total} />
      </div>
    </div>
  </Section>
);
