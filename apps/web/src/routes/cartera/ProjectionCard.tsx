// «¿Dónde podría estar?» — the core in N years under scenarios the owner writes: today's pot plus the
// monthly contribution of the settings (without the bucket's share), grown at the return of each
// scenario blended with the target weights. There is **no default return**: a scenario without the
// return of a class that has weight shows no figure and says which class is missing. Assumptions
// are typed here and kept here; the figures are the domain's (`projection`). Not a forecast.

import type { CoreWeights, Settings } from "@atlas/domain";
import { projection } from "@atlas/domain/portfolio";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { Amount, Field, Figure, Notice, Section, StatLine } from "../../components/index.js";
import { valueLabel } from "../../format/labels.js";
import {
  emptyProjectionInputs,
  MAX_SCENARIOS,
  type ProjectionInputs,
  projectionView,
  readProjection,
  type ScenarioView,
} from "../../view-models/core/projection.js";

const goalText = (goal: ScenarioView["goal"]): string => {
  if (goal === "now") {
    return "ya lo tienes";
  }
  if (goal === "never") {
    return "no se alcanza en el horizonte";
  }
  const years = Math.floor((goal as number) / 12);
  const months = (goal as number) % 12;
  return `en ${years} años y ${months} meses`;
};

export const ProjectionCard = (props: {
  weights: CoreWeights;
  settings: Settings;
}): JSX.Element => {
  const [inputs, setInputs] = createSignal<ProjectionInputs>(emptyProjectionInputs());
  const read = createMemo(() => readProjection(inputs()));
  /** The classes the owner has to give a return for: the ones with a target weight. */
  const classes = () =>
    props.weights.by_class
      .filter((share) => share.target_pct.isPositive())
      .map((share) => share.asset_class);
  const view = createMemo(() => {
    const assumptions = read().assumptions;
    return assumptions === undefined
      ? undefined
      : projectionView(
          projection(props.weights, props.settings, assumptions),
          assumptions.goalEur !== undefined,
        );
  });
  const patch = (change: Partial<ProjectionInputs>) => setInputs({ ...inputs(), ...change });
  const setReturn = (scenario: number, assetClass: string, raw: string) =>
    patch({
      scenarios: inputs().scenarios.map((entry, at) =>
        at === scenario ? { ...entry, returns: { ...entry.returns, [assetClass]: raw } } : entry,
      ),
    });
  const setName = (scenario: number, name: string) =>
    patch({
      scenarios: inputs().scenarios.map((entry, at) =>
        at === scenario ? { ...entry, name } : entry,
      ),
    });

  return (
    <Section title="Proyección" class="span-12 projection-card">
      <p class="card-note">
        Dónde podría estar la cartera principal con tu aportación mensual y los pesos objetivo de
        Configuración, si cada tipo de activo rindiera lo que escribas. Sin rentabilidades por
        defecto: no hay cifra hasta que las escribas. No es una previsión.
      </p>
      <div class="fieldset assumptions">
        <Field
          id="pj-years"
          kind="integer"
          label="Años"
          value={inputs().years}
          error={read().years}
          onInput={(years) => patch({ years })}
        />
        <Field
          id="pj-goal"
          kind="decimal"
          label="Objetivo (opcional)"
          unit="€"
          hint="Dice en qué mes se alcanza."
          value={inputs().goal}
          error={read().goal}
          onInput={(goal) => patch({ goal })}
        />
      </div>
      <For each={inputs().scenarios}>
        {(scenario, index) => (
          <fieldset class="scenario">
            <legend>Escenario {index() + 1}</legend>
            <div class="fieldset assumptions">
              <Field
                id={`pj-name-${index()}`}
                kind="text"
                label="Nombre"
                value={scenario.name}
                onInput={(name) => setName(index(), name)}
              />
              <For each={classes()}>
                {(assetClass) => (
                  <Field
                    id={`pj-${index()}-${assetClass}`}
                    kind="decimal"
                    label={`Rentabilidad anual de ${valueLabel(assetClass).toLowerCase()}`}
                    unit="%"
                    value={scenario.returns[assetClass] ?? ""}
                    error={read().returns[`${index()}:${assetClass}`]}
                    onInput={(raw) => setReturn(index(), assetClass, raw)}
                  />
                )}
              </For>
            </div>
            <Show when={inputs().scenarios.length > 1}>
              <button
                type="button"
                class="secondary"
                onClick={() =>
                  patch({ scenarios: inputs().scenarios.filter((_, at) => at !== index()) })
                }
              >
                Quitar este escenario
              </button>
            </Show>
          </fieldset>
        )}
      </For>
      <Show when={inputs().scenarios.length < MAX_SCENARIOS}>
        <button
          type="button"
          class="secondary"
          onClick={() =>
            patch({
              scenarios: [
                ...inputs().scenarios,
                { name: `Escenario ${inputs().scenarios.length + 1}`, returns: {} },
              ],
            })
          }
        >
          Añadir un escenario
        </button>
      </Show>
      <Show when={view()}>
        {(shown) => (
          <Show
            when={shown().gap === undefined}
            fallback={
              <Notice severity="info" title="Sin cifra">
                Todavía no se puede proyectar: {shown().gap}.
              </Notice>
            }
          >
            <StatLine label="Hoy">
              <Amount value={shown().start} missingReason="sin dato" />
            </StatLine>
            <StatLine label="Aportación mensual a la cartera principal">
              <Amount value={shown().monthly} missingReason="sin dato" />
            </StatLine>
            <For each={shown().scenarios}>
              {(scenario) => (
                <div class="scenario-result">
                  <h3 class="block-title">{scenario.name}</h3>
                  <Show
                    when={scenario.end}
                    fallback={
                      <p class="meta">
                        Falta la rentabilidad de {scenario.missingReturns.join(", ")}.
                      </p>
                    }
                  >
                    <StatLine label="Rentabilidad mezclada con tus pesos objetivo">
                      <Figure value={scenario.blendedPct} unit="percent" decimals="auto" />
                    </StatLine>
                    <StatLine label={`Dentro de ${shown().years} años`}>
                      <Amount value={scenario.end} />
                    </StatLine>
                    <StatLine label="De lo cual aportado">
                      <Amount value={scenario.contributed} />
                    </StatLine>
                    <Show when={scenario.goal !== undefined}>
                      <StatLine label="Objetivo">{goalText(scenario.goal)}</StatLine>
                    </Show>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        )}
      </Show>
    </Section>
  );
};
