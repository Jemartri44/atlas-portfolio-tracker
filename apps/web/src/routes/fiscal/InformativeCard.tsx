// The state of the Modelo 720 and the Modelo 721.
//
// Two rules the card never breaks:
//
//   1. **Never "no hay que presentarlo" with data missing.** When something is
//      missing the verdict is "no se puede determinar" and what is missing
//      comes as an action in a `.pending` block, never as an error: a
//      valuation that has not been recorded is the normal state of a ledger
//      priced by hand.
//   2. **With privacy on there is no bar and no percentage against the
//      threshold** (decision (k)): the threshold is a public figure, so a
//      percentage of it is the amount in disguise. The verdict is not, and it
//      stays.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Amount, Figure, Notice, Pending, Section, Tag } from "../../components/index.js";
import type { CategoryView, InformativeView } from "../../view-models/fiscal/index.js";
import { CriteriaList } from "./Criteria.jsx";

const Category = (props: { category: CategoryView; year: number; model: string }): JSX.Element => (
  <div class="informative-cat">
    <div class="group-head">
      <span>{props.category.title}</span>
      <Tag tone={props.category.tone}>{props.category.verdictText}</Tag>
    </div>
    <dl class="kpis">
      <div class="kpi">
        <dt>A 31 de diciembre</dt>
        <dd>
          <Amount value={props.category.value_eur} />
        </dd>
      </div>
      <Show when={props.category.q4_average_eur}>
        {(average) => (
          <div class="kpi">
            <dt>Saldo medio del último trimestre</dt>
            <dd>
              <Amount value={average()} />
            </dd>
          </div>
        )}
      </Show>
      <Show when={props.category.share_pct}>
        {(share) => (
          <div class="kpi">
            <dt>Del umbral</dt>
            <dd>
              <Figure value={share()} unit="percent" decimals={1} />
            </dd>
          </div>
        )}
      </Show>
    </dl>
    <For each={props.category.reasons}>{(reason) => <p class="card-note">{reason}</p>}</For>
    <Show when={props.category.missing.length > 0}>
      <Pending action={{ label: "Registrar una valoración", to: "/registrar/valuation" }}>
        {props.category.missing.join(" ")}
      </Pending>
    </Show>
    <Show when={props.category.decided_with.length > 0}>
      <p class="card-note">
        El veredicto se ha decidido con datos marcados: {props.category.decided_with.join(" ")}
      </p>
    </Show>
  </div>
);

export const InformativeCard = (props: { view: InformativeView }): JSX.Element => (
  <Section
    title={props.view.title}
    class="span-6"
    aside={<span class="scope">Ejercicio {props.view.year}</span>}
  >
    <p class="card-note">{props.view.periodText}</p>
    <Show when={props.view.period !== "before_model"}>
      <For each={props.view.categories}>
        {(category) => (
          <Category category={category} year={props.view.year} model={props.view.model} />
        )}
      </For>
      <Show when={props.view.excluded.length > 0}>
        <p class="card-note">No cuentan tus cuentas en España: {props.view.excluded.join(", ")}.</p>
      </Show>
      <Show when={props.view.previousText}>{(text) => <p class="card-note">{text()}</p>}</Show>
      <Show
        when={props.view.filedText}
        fallback={
          <Show when={props.view.categories.some((category) => category.verdict === "obliged")}>
            <Notice
              severity="caution"
              title="Hay que presentarlo y no consta presentado"
              action={
                <A href={`/fiscal/presentar/${props.view.model}/${props.view.year}`} role="button">
                  Registrar lo presentado
                </A>
              }
            >
              Cuando lo presentes, regístralo aquí: es lo que permite avisarte el año que viene si
              sube lo bastante como para volver a presentarlo.
            </Notice>
          </Show>
        }
      >
        {(text) => <p class="card-note">{text()}</p>}
      </Show>
      <CriteriaList criteria={props.view.criteria} />
    </Show>
  </Section>
);
