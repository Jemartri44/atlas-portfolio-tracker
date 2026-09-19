// The first steps of an empty ledger, with their state (D4 of
// docs/design/system.md, §5.18): done, current with the main button, or
// pending with the way to it. They leave the summary with the first purchase.

import { A } from "@solidjs/router";
import { For, type JSX, Match, Switch } from "solid-js";
import { Icon } from "../../components/index.js";
import type { Onboarding, OnboardingStep } from "../../view-models/index.js";

const Body = (props: { step: OnboardingStep; children?: JSX.Element }): JSX.Element => (
  <div class="step-body">
    <h3 class="step-title">{props.step.title}</h3>
    <p class="step-text">{props.step.text}</p>
    {props.children}
  </div>
);

const Step = (props: { step: OnboardingStep; number: number; current: boolean }): JSX.Element => (
  <Switch>
    <Match when={props.step.done}>
      <div class="step is-done">
        <span class="step-mark">
          <Icon name="check" class="icon-sm" />
          <span class="sr-only">Hecho</span>
        </span>
        <Body step={props.step} />
      </div>
    </Match>
    <Match when={props.current}>
      <div class="step is-current">
        <span class="step-mark">{props.number}</span>
        <Body step={props.step}>
          <A href={props.step.action.to} role="button">
            {props.step.action.label}
            <Icon name="arrow" class="icon-sm" />
          </A>
        </Body>
      </div>
    </Match>
    <Match when={!props.current}>
      <A href={props.step.action.to} class="step">
        <span class="step-mark">{props.number}</span>
        <Body step={props.step}>
          <span class="step-go">
            {props.step.action.label}
            <Icon name="arrow" class="icon-sm" />
          </span>
        </Body>
        <Icon name="chevright" class="icon-sm chev" />
      </A>
    </Match>
  </Switch>
);

export const FirstSteps = (props: { onboarding: Onboarding }): JSX.Element => {
  const total = (): number => props.onboarding.steps.length;
  return (
    <section class="card onboarding span-12" aria-labelledby="h-steps">
      <div class="onboarding-head">
        <div class="card-head">
          <h2 id="h-steps">Primeros pasos</h2>
          <div class="progress">
            <span class="meta">
              {props.onboarding.done} de {total()}
            </span>
            <span class="track" aria-hidden="true">
              <For each={props.onboarding.steps}>
                {(step) => <span class={step.done ? "is-done" : undefined} />}
              </For>
            </span>
          </div>
        </div>
        <p class="onboarding-lead">
          Atlas solo sabe lo que tú le cuentas. Con estos pasos el resumen empezará a llenarse.
        </p>
      </div>
      <ol class="steps">
        <For each={props.onboarding.steps}>
          {(step, index) => (
            <li>
              <Step
                step={step}
                number={index() + 1}
                current={props.onboarding.current === step.key}
              />
            </li>
          )}
        </For>
      </ol>
      <p class="onboarding-foot">
        <Icon name="import" class="icon-sm" />
        <span>
          ¿Ya llevas tus datos en un archivo? <A href="/ajustes">Importar un archivo</A>
        </span>
      </p>
    </section>
  );
};
