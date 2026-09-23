// What was filed for this year, and what the application computes today.
//
// **What was filed is a fact** (ADR-0020): it is shown as it was declared, and
// the application never corrects it. What it does is compare, and say where
// each difference comes from — what was changed by hand before filing, what
// was recorded afterwards, a criterion read the other way, or the engine
// itself computing differently than it did that day. Each of the four leads to
// a different decision, which is why they are told apart instead of added up.

import type { Money } from "@atlas/domain";
import type { FilingComparison, FilingFigure } from "@atlas/domain/fiscal";
import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Amount, Disclosure, Notice, Section, StatLine } from "../../components/index.js";
import { formatDate } from "../../format/date.js";

const FIGURE_NAMES: Record<string, string> = {
  savings_base: "Base del ahorro",
  deferred: "Pérdidas aplazadas por recompra a 31/12",
};

const figureName = (figure: string): string => {
  const known = FIGURE_NAMES[figure];
  if (known !== undefined) {
    return known;
  }
  const [, year, category] = figure.split(":") as [string, string, string];
  return category === "capital_gain"
    ? `Pérdidas patrimoniales de ${year} pendientes`
    : `Rendimientos negativos de ${year} pendientes`;
};

const CAUSE_NAMES: Record<string, string> = {
  at_filing: "Lo que corregiste a mano al presentar",
  later_events: "Lo registrado después de presentar",
  settings: "Un criterio leído de otra manera",
  engine: "La aplicación calcula distinto que aquel día",
};

const Figure = (props: { figure: FilingFigure }): JSX.Element => (
  <li class="filing-figure">
    <div class="group-head">
      <span>{figureName(props.figure.figure)}</span>
    </div>
    <StatLine label="Lo que declaraste">
      <Amount value={props.figure.declared} coloured />
    </StatLine>
    <StatLine label="Lo que se calcula hoy">
      <Amount value={props.figure.now} coloured />
    </StatLine>
    <Show when={props.figure.causes}>
      {(causes) => (
        <Show when={!props.figure.declared.eq(props.figure.now)}>
          <Disclosure label="De dónde viene la diferencia">
            <For each={Object.entries(causes()) as [string, Money][]}>
              {([cause, amount]) => (
                <Show when={!amount.isZero()}>
                  <StatLine label={CAUSE_NAMES[cause] ?? cause}>
                    <Amount value={amount} signed coloured />
                  </StatLine>
                </Show>
              )}
            </For>
          </Disclosure>
        </Show>
      )}
    </Show>
  </li>
);

export const FilingCard = (props: {
  year: number;
  filing?: FilingComparison | undefined;
  /** Nothing to declare and nothing filed: the card keeps quiet about it. */
  quiet: boolean;
}): JSX.Element => (
  <Show
    when={props.filing}
    fallback={
      <Show when={!props.quiet}>
        <Section title="Lo presentado" class="span-6">
          <Notice
            severity="info"
            title={`No consta que hayas presentado la Renta de ${props.year}`}
            action={
              <A href={`/fiscal/presentar/renta/${props.year}`} role="button">
                Registrar lo presentado
              </A>
            }
          >
            Registrarlo es lo que permite avisarte cuando algo que hagas mueva una cifra que ya
            declaraste.
          </Notice>
        </Section>
      </Show>
    }
  >
    {(filing) => (
      <Section
        title="Lo presentado"
        class="span-6"
        aside={<span class="scope">Declarado el {formatDate(filing().filed_at)}</span>}
      >
        <Show when={filing().chain.length > 1}>
          <p class="card-note">
            Hay {filing().chain.length} presentaciones de este ejercicio: manda la última, y las
            anteriores siguen constando, porque ocurrieron.
          </p>
        </Show>
        <Show when={!filing().fingerprint_ok}>
          <Notice severity="caution" title="Tus datos han cambiado desde que lo presentaste">
            La comparación de abajo se hace con el libro de hoy, así que una diferencia puede venir
            de algo que registraste después.
          </Notice>
        </Show>
        <ul class="filing-figures">
          <For each={filing().figures}>{(figure) => <Figure figure={figure} />}</For>
        </ul>
        <A href={`/fiscal/presentar/renta/${props.year}`} class="card-foot">
          <span>Registrar una complementaria</span>
        </A>
      </Section>
    )}
  </Show>
);
