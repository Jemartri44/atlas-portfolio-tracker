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
import {
  Amount,
  Disclosure,
  FoldSection,
  Icon,
  type NoticeItem,
  NoticeList,
  StatLine,
  Tag,
  TotalLine,
} from "../../components/index.js";
import { countOf, pct } from "../../format/number.js";
import type { ControlsView, GaugesView } from "../../view-models/bucket/index.js";
import type { NetWorthView } from "../../view-models/index.js";
import { Meter } from "./Meters.jsx";

/** The thresholds of the two rules, as configured; absent when not set. */
interface BucketLimits {
  stopLossPct?: string | undefined;
  maxWeightPct?: string | undefined;
}

const UNSET = "Todavía no tiene umbral: fíjalo en Ajustes → Configuración.";

const Rule = (props: {
  title: string;
  ask: string;
  limit: string | undefined;
  /** Why it could not be measured, and what that does not mean. */
  unavailable: string | undefined;
  absent: string;
}): JSX.Element => (
  <>
    <h3 class="block-title">{props.title}</h3>
    <p class="card-note">
      {props.limit === undefined ? UNSET : props.ask.replace("{x}", pct(props.limit))}
    </p>
    <Show when={props.unavailable}>
      {(reason) => (
        <p class="card-note">
          {reason()}. {props.absent}
        </p>
      )}
    </Show>
  </>
);

/** A rule in a line: its threshold and its state, with the gauge when it could be measured. */
const RuleState = (props: {
  label: string;
  limit: string | undefined;
  unavailable: string | undefined;
  children: JSX.Element;
}): JSX.Element => (
  <Show
    when={props.unavailable === undefined && props.limit !== undefined}
    fallback={
      <StatLine
        label={props.limit === undefined ? props.label : `${props.label} · ${pct(props.limit)}`}
      >
        <Tag tone="caution">{props.limit === undefined ? "sin umbral" : "no evaluada"}</Tag>
      </StatLine>
    }
  >
    {props.children}
  </Show>
);

/**
 * The line of the folded card: how much of the cap, whether it has passed its mark, and how many
 * other notices wait inside, because the fold never hides that there is one.
 */
export const folded = (view: ControlsView, gauges: GaugesView, notices: number): string => {
  const used = gauges.contributionPctOfCap;
  const codes = new Set(view.warnings.map((warning) => warning.code));
  const state = codes.has("bucket_contribution_exceeded")
    ? " · tope superado"
    : codes.has("bucket_contribution_near_limit")
      ? ` · pasa del ${pct(gauges.nearLimitPct)}`
      : "";
  const others = notices - (state === "" ? 0 : 1);
  const more = others > 0 ? ` · ${countOf(others, "aviso", "avisos")}` : "";
  return `${used === undefined ? "Sin tope fijado" : `${pct(used)} del tope${state}`}${more}`;
};

export const BudgetCard = (props: {
  view: ControlsView;
  /** The three gauges, from the domain: the figures and the marks of its rules. */
  gauges: GaugesView;
  worth: NetWorthView;
  limits: BucketLimits;
  /** What the budget warns of that no line of the card already says: a cap passed. */
  notices: readonly NoticeItem[];
}): JSX.Element => (
  <FoldSection
    title="Presupuesto y control"
    summary={folded(props.view, props.gauges, props.notices.length)}
  >
    <Show when={props.notices.length > 0}>
      <NoticeList items={props.notices} label="Avisos del presupuesto" />
    </Show>
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
    <Meter gauges={props.gauges} which="cap" />
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
    <RuleState
      label="Regla de parada"
      limit={props.limits.stopLossPct}
      unavailable={props.view.lossUnavailable}
    >
      <Meter gauges={props.gauges} which="result" />
    </RuleState>
    <RuleState
      label="Regla de recogida"
      limit={props.limits.maxWeightPct}
      unavailable={props.view.weightUnavailable}
    >
      <Meter gauges={props.gauges} which="weight" />
    </RuleState>

    <Disclosure label="Por qué y las reglas en llano">
      <Rule
        title="Regla de parada"
        ask="Dejar de aportar al cubo si la pérdida acumulada pasa del {x} de lo aportado."
        limit={props.limits.stopLossPct}
        unavailable={props.view.lossUnavailable}
        absent="Sin ese dato no hay control de pérdida acumulada; no es que no la haya."
      />
      <Rule
        title="Regla de recogida"
        ask="Pasar el exceso a la cartera principal si el cubo pesa más del {x} de tu patrimonio."
        limit={props.limits.maxWeightPct}
        unavailable={props.view.weightUnavailable}
        absent="Sin ese dato no hay control de peso del cubo; no es que esté dentro."
      />
    </Disclosure>
    <Disclosure label="Peso sobre el patrimonio">
      <p class="joined">
        <Icon name="info" class="icon-sm" />
        <span>
          Es la única cifra que suma el cubo y la cartera principal: el peso se mide sobre todo tu
          patrimonio, y por eso el desglose va al lado.
        </span>
      </p>
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
    </Disclosure>
  </FoldSection>
);
