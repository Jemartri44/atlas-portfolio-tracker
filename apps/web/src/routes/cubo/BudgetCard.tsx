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
import { Amount, Figure, Icon, Section, StatLine, Tag, TotalLine } from "../../components/index.js";
import type { ControlsView } from "../../view-models/bucket/index.js";
import type { NetWorthView } from "../../view-models/index.js";

export const BudgetCard = (props: { view: ControlsView; worth: NetWorthView }): JSX.Element => (
  <Section title="Presupuesto y control" class="span-5">
    <StatLine label="Aporte bruto acumulado">
      <Amount value={props.view.contributionGross} />
      <Show when={props.view.budget !== undefined}>
        <span class="meta">
          de <Amount value={props.view.budget} /> previstos
          <Show when={props.view.monthsElapsed !== undefined}>
            {" "}
            ({props.view.monthsElapsed} {props.view.monthsElapsed === 1 ? "mes" : "meses"})
          </Show>
        </span>
      </Show>
    </StatLine>
    <StatLine label="Resultado realizado">
      <Amount value={props.view.realized} signed coloured />
    </StatLine>
    <StatLine label="Resultado latente">
      <Amount
        value={props.view.unrealized}
        signed
        coloured
        missingReason="falta el precio de alguna posición"
      />
    </StatLine>

    <h3 class="block-title">Regla de parada (17)</h3>
    <Show
      when={props.view.lossUnavailable === undefined}
      fallback={
        <p class="card-note">
          <Tag tone="caution">no evaluada</Tag> {props.view.lossUnavailable}. Sin ese dato no hay
          control de pérdida acumulada; no es que no la haya.
        </p>
      }
    >
      <StatLine label="Pérdida acumulada sobre el aporte">
        <Figure value={props.view.lossPct} unit="percent" coloured />
      </StatLine>
    </Show>

    <h3 class="block-title">Regla de recogida (18)</h3>
    <p class="joined">
      <Icon name="info" class="icon-sm" />
      <span>
        <strong>Excepción acotada a la compartimentación.</strong> Es la única vista que junta el
        cubo y la cartera principal: el peso del cubo se mide sobre el patrimonio total, como
        control de presupuesto y no como métrica de cartera, y por eso el desglose va al lado.
      </span>
    </p>
    <Show
      when={props.view.weightUnavailable === undefined}
      fallback={
        <p class="card-note">
          <Tag tone="caution">no evaluada</Tag> {props.view.weightUnavailable}. Sin ese dato no hay
          control de peso del cubo; no es que esté dentro.
        </p>
      }
    >
      <StatLine label="Peso del cubo sobre el patrimonio total">
        <Figure value={props.view.weightPct} unit="percent" />
      </StatLine>
    </Show>

    <For each={props.worth.blocks}>
      {(block) => (
        <StatLine label={block.label}>
          <Amount value={block.subtotal} />
        </StatLine>
      )}
    </For>
    <TotalLine
      label={
        <>
          Patrimonio total
          <Show when={props.worth.partial}>
            {" "}
            <Tag icon="half">parcial</Tag>
          </Show>
        </>
      }
    >
      <Amount value={props.worth.total} />
    </TotalLine>
  </Section>
);
