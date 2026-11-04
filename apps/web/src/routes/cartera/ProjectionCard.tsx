// «¿Dónde podría estar?» — the core in N years, in three cases: its real value class by class, the
// contribution spread by the target weights, every class good or bad at once. The assumptions start
// from the published figures and what the owner edits is kept in the cloud, outside the ledger; the
// boxes are of the moment. The figures are the domain's (`projectionCases`). Not a forecast.

import type { CoreWeights, Settings } from "@atlas/domain";
import {
  type CostSummary,
  coreMonthlyOf,
  type ProjectionDiscounts,
  type ProjectionEdits,
  projectionAssumptions,
  projectionCases,
} from "@atlas/domain/portfolio";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  on,
  onCleanup,
  Show,
} from "solid-js";
import { Amount, Field, FoldSection, Notice, Tag } from "../../components/index.js";
import { valueLabel } from "../../format/labels.js";
import { createAutosave } from "../../settings-objects/autosave.js";
import { createProjectionEdits } from "../../settings-objects/use-settings-object.js";
import { projectionView } from "../../view-models/core/projection.js";
import {
  CLASS_SOURCES,
  inputsOf,
  notReadSentence,
  PROJECTION_CLASSES,
  type ProjectionInputs,
  readProjection,
} from "../../view-models/core/projection-inputs.js";
import { ProjectionResult } from "./ProjectionResult.jsx";

const SAVE_AFTER_MS = 800;

const BOXES: readonly { key: keyof ProjectionDiscounts; label: string }[] = [
  { key: "inflation", label: "Inflación" },
  { key: "taxes", label: "Impuestos al vender" },
  { key: "fees", label: "Comisiones y TER" },
];

export const ProjectionCard = (props: {
  weights: CoreWeights;
  summary: CostSummary;
  settings: Settings;
  /** The date asked about: the horizon counts from it. */
  asOf: string;
}): JSX.Element => {
  const stored = createProjectionEdits();
  const monthly = () => coreMonthlyOf(props.settings).monthly;
  const [inputs, setInputs] = createSignal<ProjectionInputs>(inputsOf({}, monthly()));
  const [discounts, setDiscounts] = createSignal<ProjectionDiscounts>({
    inflation: true,
    taxes: true,
    fees: true,
  });
  const [problem, setProblem] = createSignal<string | undefined>();

  const showStored = () => {
    const state = stored.state();
    if (state.kind === "ready") {
      setInputs(inputsOf(state.value, monthly()));
    }
  };
  const etag = () => {
    const state = stored.state();
    return state.kind === "ready" ? state.etag : undefined;
  };
  // What was typed stays on the screen: only the first read, or a conflict, replaces it.
  const loaded = createMemo(() => stored.state().kind === "ready");
  createEffect(on(loaded, (ready) => ready && showStored()));
  const saver = createAutosave<ProjectionEdits>(
    async (next) => {
      const before = etag();
      const said = await stored.save(next);
      if (said !== undefined && etag() !== before) {
        showStored();
      }
      return said;
    },
    SAVE_AFTER_MS,
    setProblem,
  );
  onCleanup(saver.flush);

  const read = createMemo(() => readProjection(inputs(), monthly()));
  /** The last edits that read: a wrong field leaves the figures of the last good ones. */
  const edits = createMemo<ProjectionEdits>((previous) => read().edits ?? previous, {});
  const view = createMemo(() =>
    projectionView(
      projectionCases(
        props.weights,
        props.summary,
        props.settings,
        projectionAssumptions(edits()),
        discounts(),
      ),
      props.asOf,
      discounts(),
    ),
  );

  const type = (field: string) => (raw: string) => {
    const next = { ...inputs(), [field]: raw };
    setInputs(next);
    const { edits: typed } = readProjection(next, monthly());
    if (typed !== undefined && stored.state().kind === "ready") {
      saver.soon(typed);
    }
  };
  const reset = () => {
    setInputs(inputsOf({}, monthly()));
    saver.now({});
  };
  const decimal = (id: string, field: string, label: string, unit: string, hint?: string) => (
    <Field
      id={id}
      kind="decimal"
      label={label}
      unit={unit}
      hint={hint}
      value={inputs()[field] ?? ""}
      error={read().errors[field]}
      onInput={type(field)}
    />
  );
  const normal = () => view().cases[1];
  const notRead = () => notReadSentence(stored.state());

  return (
    <FoldSection
      title="Proyección"
      class="span-12 projection-card"
      aside={<Tag>no es una previsión</Tag>}
      summary={
        <Show when={normal()} fallback={`Sin cifra: ${view().gap}`}>
          {(shown) => (
            <>
              Normal <Amount value={shown().value} /> dentro de {view().years} años
            </>
          )}
        </Show>
      }
    >
      <div class="fieldset assumptions">
        <Field
          id="pj-years"
          kind="integer"
          label="Años"
          value={inputs().years ?? ""}
          error={read().errors.years}
          onInput={type("years")}
        />
        {decimal(
          "pj-monthly",
          "monthly_eur",
          "Aportación mensual",
          "€",
          edits().monthly_eur === undefined
            ? "De Ajustes, sin la parte del cubo."
            : "La tuya. Vacía el campo para volver a la de Ajustes.",
        )}
        {decimal(
          "pj-inflation",
          "inflation_pct",
          "Inflación",
          "%",
          "J.P. Morgan 2027, Euro Inflation.",
        )}
        {decimal(
          "pj-commission",
          "commission_pct",
          "Comisión de cada aportación",
          "%",
          "Vacío: solo el TER.",
        )}
      </div>
      <div class="projection-classes">
        <For each={PROJECTION_CLASSES}>
          {(name) => (
            <fieldset class="scenario">
              <legend>{valueLabel(name)}</legend>
              <div class="fieldset assumptions">
                {decimal(`pj-${name}-return`, `${name}.return_pct`, "Rentabilidad anual", "%")}
                {decimal(`pj-${name}-volatility`, `${name}.volatility_pct`, "Volatilidad", "%")}
              </div>
              <p class="meta">{CLASS_SOURCES[name]}</p>
            </fieldset>
          )}
        </For>
      </div>
      <p class="card-note">
        Son estimaciones de una gestora a 10-15 años, no cifras oficiales, y el informe avisa de que
        lo del bitcoin es orientativo. Rentabilidad compuesta. Lo que cambies se guarda.
      </p>
      <div class="button-row">
        <button type="button" class="secondary" disabled={stored.busy()} onClick={reset}>
          Restablecer
        </button>
      </div>
      <Show when={notRead()}>
        {(said) => (
          <Notice severity="caution" title="Sin tus cambios">
            {said()}
          </Notice>
        )}
      </Show>
      <Show when={problem()}>
        {(said) => (
          <Notice severity="caution" title="No se ha guardado">
            {said()}
          </Notice>
        )}
      </Show>
      <fieldset class="projection-boxes">
        <legend class="sr-only">Qué descontar</legend>
        <For each={BOXES}>
          {(box) => (
            <label class="switch-row">
              <input
                type="checkbox"
                checked={discounts()[box.key]}
                onChange={(event) =>
                  setDiscounts({ ...discounts(), [box.key]: event.currentTarget.checked })
                }
              />
              <span>{box.label}</span>
            </label>
          )}
        </For>
      </fieldset>
      <ProjectionResult view={view()} />
    </FoldSection>
  );
};
