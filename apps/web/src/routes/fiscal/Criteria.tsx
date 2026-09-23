// The criteria a figure leans on, and what each one puts at stake.
//
// Two rules of the prompt are enforced here, in one place, so no card of the
// screen can get them wrong:
//
//   1. A figure that depends on a criterion **in dispute** carries a warning
//      tag with its name; one of medium or low certainty carries a neutral
//      one; the whole list waits folded. What never appears is the identifier
//      of the criterion: `format/criteria.ts` is the only voice.
//   2. **The direction and the certainty are visible with privacy on; the
//      money is not.** The direction is not an amount: "si esta lectura está
//      mal, has declarado de menos" hides nothing and is the half that lets
//      the user decide whether to look into it.

import type { CriterionId } from "@atlas/domain/fiscal";
import { FISCAL_CRITERIA } from "@atlas/domain/fiscal";

import { For, type JSX, Show } from "solid-js";
import { Amount, Disclosure, Tag } from "../../components/index.js";
import {
  CERTAINTY_LABELS,
  CRITERION_NAMES,
  certaintyTone,
  DIRECTION_SENTENCES,
  MEASURE_LABELS,
  MEASURE_REASONS,
} from "../../format/criteria.js";
import type { StakeView } from "../../view-models/fiscal/index.js";

/** The tags beside a figure: only what is not settled earns one. */
export const CriteriaTags = (props: { criteria: readonly CriterionId[] }): JSX.Element => (
  <For each={props.criteria.filter((id) => FISCAL_CRITERIA[id].certainty !== "high")}>
    {(id) => (
      <Tag tone={certaintyTone(FISCAL_CRITERIA[id].certainty)} title={CRITERION_NAMES[id]}>
        {CERTAINTY_LABELS[FISCAL_CRITERIA[id].certainty]}
      </Tag>
    )}
  </For>
);

/** The full list of criteria behind a total, folded. */
export const CriteriaList = (props: {
  criteria: readonly CriterionId[];
  label?: string;
}): JSX.Element => (
  <Show when={props.criteria.length > 0}>
    <Disclosure label={props.label ?? "De qué criterios depende"}>
      <ul class="criteria">
        <For each={props.criteria}>
          {(id) => (
            <li>
              <span>{CRITERION_NAMES[id]}</span>
              <Tag tone={certaintyTone(FISCAL_CRITERIA[id].certainty)}>
                {CERTAINTY_LABELS[FISCAL_CRITERIA[id].certainty]}
              </Tag>
            </li>
          )}
        </For>
      </ul>
    </Disclosure>
  </Show>
);

/** One criterion with its certainty, its direction and what it puts at stake. */
const Stake = (props: { stake: StakeView }): JSX.Element => (
  <li class="stake">
    <div class="stake-head">
      <span class="stake-name">{CRITERION_NAMES[props.stake.criterion]}</span>
      <Tag tone={certaintyTone(props.stake.certainty)}>
        {CERTAINTY_LABELS[props.stake.certainty]}
      </Tag>
    </div>
    <p class="stake-direction">{DIRECTION_SENTENCES[props.stake.direction]}</p>
    <div class="stake-figures">
      <Show
        when={props.stake.measure !== "not_quantifiable"}
        fallback={<span class="stake-measure">{MEASURE_LABELS.not_quantifiable}</span>}
      >
        <span class="stake-measure">{MEASURE_LABELS[props.stake.measure]}</span>
        <Amount value={props.stake.amount_eur} signed coloured />
      </Show>
    </div>
    {/* Two entries of the same criterion differ in **why**, so the reason is
        always shown: without it the screen printed the same line twice. */}
    <Show
      when={props.stake.reason}
      fallback={
        <Show when={props.stake.subjects.length > 0}>
          <p class="stake-scope">
            Por {props.stake.subjects.join(", ")}
            {props.stake.more > 0 ? ` y ${props.stake.more} más` : ""}.
          </p>
        </Show>
      }
    >
      {(reason) => <p class="stake-scope">{MEASURE_REASONS[reason()]}</p>}
    </Show>
    <p class="stake-scope">
      {props.stake.operations === 1
        ? "Afecta a 1 operación de este ejercicio."
        : `Afecta a ${props.stake.operations} operaciones de este ejercicio.`}
    </p>
  </li>
);

/**
 * Three at a time, and the rest folded. With the synthetic ledger the list
 * reached ten entries and took four phone screens of the one screen whose
 * figure at the top is what the user came for; the notices of the summary
 * already follow this rule (`NoticeList`).
 */
const FIRST = 3;

export const StakeList = (props: { stakes: readonly StakeView[] }): JSX.Element => {
  const rest = (): readonly StakeView[] => props.stakes.slice(FIRST);
  return (
    <>
      <ul class="stakes">
        <For each={props.stakes.slice(0, FIRST)}>{(stake) => <Stake stake={stake} />}</For>
      </ul>
      <Show when={rest().length > 0}>
        <Disclosure
          label={rest().length === 1 ? "Ver 1 criterio más" : `Ver ${rest().length} criterios más`}
        >
          <ul class="stakes">
            <For each={rest()}>{(stake) => <Stake stake={stake} />}</For>
          </ul>
        </Disclosure>
      </Show>
    </>
  );
};
