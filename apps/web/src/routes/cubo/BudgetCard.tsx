// The budget of the bucket and its two control rules, stop and harvest, each
// headed by what it asks in plain words and the threshold the user set.
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
import { formatPercent, meaningfulDecimals } from "../../format/number.js";
import type { ControlsView } from "../../view-models/bucket/index.js";
import type { NetWorthView } from "../../view-models/index.js";

/** The thresholds of the two rules, as configured; absent when not set. */
export interface BucketLimits {
  stopLossPct?: string | undefined;
  maxWeightPct?: string | undefined;
}

const UNSET = "Todavía no tiene umbral: fíjalo en Ajustes → Configuración.";

const pct = (value: string): string =>
  formatPercent(value, { decimals: meaningfulDecimals(value) });

const Rule = (props: { title: string; ask: string; limit: string | undefined }): JSX.Element => (
  <>
    <h3 class="block-title">{props.title}</h3>
    <p class="card-note">
      {props.limit === undefined ? UNSET : props.ask.replace("{x}", pct(props.limit))}
    </p>
  </>
);

export const BudgetCard = (props: {
  view: ControlsView;
  worth: NetWorthView;
  limits: BucketLimits;
}): JSX.Element => (
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

    <Rule
      title="Regla de parada"
      ask="Dejar de aportar al cubo si la pérdida acumulada pasa del {x} de lo aportado."
      limit={props.limits.stopLossPct}
    />
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

    <Rule
      title="Regla de recogida"
      ask="Pasar el exceso a la cartera principal si el cubo pesa más del {x} de tu patrimonio."
      limit={props.limits.maxWeightPct}
    />
    <p class="joined">
      <Icon name="info" class="icon-sm" />
      <span>
        Es la única cifra que suma el cubo y la cartera principal: el peso se mide sobre todo tu
        patrimonio, y por eso el desglose va al lado.
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
