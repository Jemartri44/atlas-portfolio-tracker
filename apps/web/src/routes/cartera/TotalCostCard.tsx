// «¿Qué me costará?» — TER, commissions and the tax friction of selling, over the years, in euros
// that never reach the pot. A what-if over assumptions typed here (the gross return, the commission
// of each contribution, the exit tax rate): nothing is kept, and a piece that is missing is said,
// never assumed. Core only; the figures are the domain's (`totalCost`).

import type { Settings } from "@atlas/domain";
import { type CostSummary, totalCost } from "@atlas/domain/portfolio";
import { createMemo, createSignal, type JSX, Show } from "solid-js";
import { Amount, Field, FoldSection, Notice, StatLine, TotalLine } from "../../components/index.js";
import {
  type CostInputs,
  emptyCostInputs,
  readCost,
  totalCostView,
} from "../../view-models/core/total-cost.js";

export const TotalCostCard = (props: { summary: CostSummary; settings: Settings }): JSX.Element => {
  const [inputs, setInputs] = createSignal<CostInputs>(emptyCostInputs());
  const set = (key: keyof CostInputs) => (value: string) =>
    setInputs({ ...inputs(), [key]: value });
  const read = createMemo(() => readCost(inputs()));
  const view = createMemo(() => {
    const assumptions = read().assumptions;
    return assumptions === undefined
      ? undefined
      : totalCostView(totalCost(props.summary, props.settings, assumptions));
  });
  const errors = () => read().errors;
  return (
    <FoldSection
      title="Coste total a largo plazo"
      class="span-12 total-cost"
      summary={
        <Show when={view()} fallback="Escribe la rentabilidad bruta para ver el coste">
          {(shown) => (
            <Show when={shown().gap === undefined} fallback={`Sin cifra: ${shown().gap}`}>
              <Amount value={shown().total} missingReason="sin dato" /> en {shown().years} años
            </Show>
          )}
        </Show>
      }
    >
      <p class="card-note">
        Lo que el TER, las comisiones y los impuestos al vender se llevarían de la cartera principal
        en el horizonte. Es un supuesto tuyo, no una previsión: nada de esto se guarda.
      </p>
      <div class="fieldset assumptions">
        <Field
          id="tc-years"
          kind="integer"
          label="Años"
          value={inputs().years}
          error={errors().years}
          onInput={set("years")}
        />
        <Field
          id="tc-gross"
          kind="decimal"
          label="Rentabilidad bruta anual"
          unit="%"
          value={inputs().grossReturn}
          error={errors().grossReturn}
          onInput={set("grossReturn")}
        />
        <Field
          id="tc-commission"
          kind="decimal"
          label="Comisión de cada aportación"
          unit="%"
          hint="Vacío: no se calcula la parte de comisiones."
          value={inputs().commission}
          error={errors().commission}
          onInput={set("commission")}
        />
        <Field
          id="tc-exit"
          kind="decimal"
          label="Impuesto al vender todo"
          unit="%"
          hint="Tipo plano sobre la ganancia: un orden de magnitud, no el impuesto del motor fiscal."
          value={inputs().exitTax}
          error={errors().exitTax}
          onInput={set("exitTax")}
        />
      </div>
      <Show
        when={view()}
        fallback={<p class="meta">Escribe la rentabilidad bruta anual para ver el coste.</p>}
      >
        {(shown) => (
          <Show
            when={shown().gap === undefined}
            fallback={
              <Notice severity="info" title="Sin cifra">
                Todavía no se puede calcular: {shown().gap}.
              </Notice>
            }
          >
            <StatLine label={`Sin costes, a ${shown().years} años`}>
              <Amount value={shown().withoutCosts} missingReason="sin dato" />
            </StatLine>
            <StatLine label="Con TER y comisiones">
              <Amount value={shown().net} missingReason="sin dato" />
            </StatLine>
            <StatLine label="Se lleva el TER">
              <Amount value={shown().ter} missingReason="sin dato" />
            </StatLine>
            <StatLine label="Se llevan las comisiones">
              <Amount value={shown().commission} missingReason="falta la comisión" />
            </StatLine>
            <StatLine label="Se lleva el impuesto al vender">
              <Amount value={shown().exitTax} missingReason="falta el tipo" />
            </StatLine>
            <TotalLine label="Coste total en el horizonte">
              <Amount value={shown().total} missingReason="sin dato" />
            </TotalLine>
            <Show when={shown().missing}>
              {(missing) => <p class="card-note">El total no cuenta lo que falta: {missing()}</p>}
            </Show>
            <Show when={shown().terMissing}>
              {(left) => (
                <p class="card-note">
                  No cuenta <Amount value={left()} /> de la cartera valorada cuyos activos no
                  declaran su TER.
                </p>
              )}
            </Show>
          </Show>
        )}
      </Show>
    </FoldSection>
  );
};
