// "¿Dónde va el dinero este mes?" — the split of the monthly contribution.
//
// Two things the card says every time, and they are not decoration:
//   - the bucket share is a **budget**, separated first and never allocated
//     among the target weights (constitution III);
//   - this is a **proposal**. The orders are placed by hand on the platform and
//     recorded afterwards; the application has never sent an order and never
//     will.
//
// On screen (docs/design/system.md §7.5): the «Propuesta» tag, the strip of
// three figures, what goes to each asset, and the way to record it. The notes, the plan per platform
// and the whole calculation — value today, shortfall, weight after — are one tap away.

import { type JSX, Show } from "solid-js";
import { ErrorView, Field, Notice, Pending, Section, Tag } from "../../components/index.js";
import { formatMonth } from "../../format/date.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { type NameIndex, NO_NAMES } from "../../format/names.js";
import type { AppError } from "../../ledger/state.js";
import { privacy } from "../../shell/preferences.js";
import type { ContributionView } from "../../view-models/core/index.js";
import { Split } from "./ContributionSplit.jsx";
import type { Repurchase } from "./plan-repurchase.jsx";
import { REMEDIES } from "./remedies.js";

/** A refusal with a known remedy is a pending datum, never an error. */
const Refusal = (props: { error: AppError }): JSX.Element => (
  <Show
    when={REMEDIES[props.error.code]}
    fallback={<ErrorView error={props.error} title="La aportación no se puede repartir" />}
  >
    {(remedy) => <Pending action={remedy()}>{props.error.message}</Pending>}
  </Show>
);

export const ContributionCard = (props: {
  view: ContributionView | undefined;
  error: AppError | undefined;
  names?: NameIndex;
  /** What is typed in «Importe de este mes»; empty means the amount of the settings. */
  amountText?: string;
  onAmountText?: (text: string) => void;
  /** Why the typed text was not used, if it was not. */
  amountError?: string | undefined;
  /** What a purchase of the plan would defer; loaded apart, so absent at first. */
  repurchase?: Repurchase;
}): JSX.Element => (
  <Section
    title={
      props.view === undefined
        ? "Aportación del mes"
        : `Aportación de ${formatMonth(props.view.date)}`
    }
    class="cartera-contribution"
    aside={props.view === undefined ? undefined : <Tag tone="accent">Propuesta</Tag>}
  >
    <Show when={props.onAmountText}>
      {(onInput) => (
        <Field
          id="contribution-amount"
          kind="decimal"
          unit="€"
          label="Importe de este mes"
          placeholder="El de los ajustes"
          hint="Vacío usa los ajustes. No se guarda."
          value={props.amountText ?? ""}
          error={props.amountError}
          onInput={onInput()}
        />
      )}
    </Show>
    <Show
      when={props.view}
      fallback={
        <Show when={props.error} fallback={<p class="meta">Sin datos.</p>}>
          {(error) => <Refusal error={error()} />}
        </Show>
      }
    >
      {(view) => (
        <>
          <Show when={view().approximation}>
            {(note) => (
              <Notice severity="caution">
                {describeWarning(note(), {
                  names: props.names ?? NO_NAMES,
                  privacy: privacy(),
                })}
              </Notice>
            )}
          </Show>
          <Split view={view()} {...(props.repurchase ? { repurchase: props.repurchase } : {})} />
        </>
      )}
    </Show>
  </Section>
);
