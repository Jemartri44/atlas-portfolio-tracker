// "¿Y si quiero acercarme a los pesos objetivo?" — the rebalance button (feature 028).
//
// A proposal and nothing else: the orders are placed by hand and recorded as
// always. The steps come in the order of what they cost: new money first, then
// transfers between funds (no tax), and last the sales, each with its estimated
// tax and its commissions on the table before anyone decides. The owner stops
// where they want: every step says where the core stands if the plan ends there.
//
// The domain is loaded when the button is pressed, not with the Cartera: it
// carries the tax engine, which the first screen does not need.

import type { ExternalPrices, LedgerEvent, LedgerState, Settings } from "@atlas/domain";
import { bucketStats } from "@atlas/domain/portfolio";
import { createEffect, createMemo, createSignal, type JSX, on, Show } from "solid-js";
import {
  Amount,
  ErrorView,
  Field,
  FoldSection,
  Pending,
  StatLine,
  Switch,
  Tag,
} from "../../components/index.js";
import type { NameIndex } from "../../format/names.js";
import { attempt } from "../../ledger/query.js";
import type { AppError } from "../../ledger/state.js";
import {
  type BucketPartView,
  bucketPartView,
  type RebalanceView,
  rebalanceView,
  typedAmount,
} from "../../view-models/core/index.js";
import { Result } from "./RebalanceResult.jsx";

/** What fixes each refusal, and where; a refusal with a remedy is a pending datum, not an error. */
const REMEDIES: Record<string, { label: string; to: string }> = {
  missing_manual_prices: { label: "Registrar una valoración", to: "/registrar/valuation" },
  missing_target_weights: { label: "Fijar los pesos objetivo", to: "/ajustes/configuracion" },
  no_target_weight_in_table: { label: "Revisar los pesos objetivo", to: "/ajustes/configuracion" },
  missing_deviation_threshold: {
    label: "Fijar el umbral de desviación",
    to: "/ajustes/configuracion",
  },
};

interface RebalanceCardProps {
  state: LedgerState;
  events: readonly LedgerEvent[];
  date: string;
  settings: Settings;
  external: ExternalPrices | undefined;
  names: NameIndex;
}

export const RebalanceCard = (props: RebalanceCardProps): JSX.Element => {
  const [amountText, setAmountText] = createSignal("");
  const [outcome, setOutcome] = createSignal<
    { ok: true; value: RebalanceView } | { ok: false; error: AppError } | undefined
  >(undefined);
  const [busy, setBusy] = createSignal(false);
  const [withBucket, setWithBucket] = createSignal(true);
  const [bucket, setBucket] = createSignal<BucketPartView | undefined>(undefined);
  const typed = createMemo(() => typedAmount(amountText()));
  const amountError = (): string | undefined => {
    const value = typed();
    return value.kind === "invalid" ? value.message : undefined;
  };

  // Bumped whenever the inputs change: a calculation that started before is then stale.
  let generation = 0;

  // A proposal belongs to the date and to the ledger, settings and prices it was computed from.
  createEffect(
    on(
      () => [props.date, props.state, props.events, props.settings, props.external],
      () => {
        generation += 1;
        setOutcome(undefined);
        setBucket(undefined);
      },
      { defer: true },
    ),
  );

  const run = async (): Promise<void> => {
    const money = typed();
    if (money.kind === "invalid") {
      return;
    }
    const started = generation;
    setBusy(true);
    try {
      const { rebalancePlan } = await import("@atlas/domain/rebalance");
      // The inputs changed while the planner loaded: that press belongs to a screen already gone.
      if (started !== generation) {
        return;
      }
      const part = attempt(() =>
        bucketPartView(
          money.kind === "amount" ? money.value : undefined,
          props.settings,
          bucketStats(
            props.state,
            props.events,
            props.date,
            props.settings,
            props.date,
            props.external,
          ).controls,
        ),
      );
      setBucket(part.ok ? part.value : undefined);
      setOutcome(
        attempt(() =>
          rebalanceView(
            rebalancePlan(props.state, props.events, {
              date: props.date,
              settings: props.settings,
              ...(money.kind === "amount" ? { amount: money.value } : {}),
              ...(props.external === undefined ? {} : { external: props.external }),
            }),
            props.names,
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const failure = () => {
    const value = outcome();
    return value?.ok === false ? value.error : undefined;
  };
  const view = () => {
    const value = outcome();
    return value?.ok === true ? value.value : undefined;
  };

  const body = (): JSX.Element => (
    <>
      <p class="card-note">
        Propone cómo acercarte a los pesos objetivo: primero con dinero nuevo, después con traspasos
        entre fondos (sin impuestos) y, solo si hace falta, con ventas, enseñándote antes el
        impuesto aproximado y las comisiones. El cubo nunca entra en los pesos. Nada se registra.
      </p>
      <div class="fieldset assumptions">
        <Field
          id="rebalance-amount"
          kind="decimal"
          unit="€"
          label="Dinero nuevo para la cartera (opcional)"
          placeholder="Nada"
          hint="Ya sin la parte del cubo. No se guarda."
          value={amountText()}
          error={amountError()}
          onInput={setAmountText}
        />
        <Switch
          id="rebalance-bucket"
          label="Incluir el cubo"
          hint="Calcula aparte lo que le toca. No se guarda."
          checked={withBucket()}
          onChange={setWithBucket}
        />
      </div>
      <div class="button-row">
        <button type="button" disabled={busy() || amountError() !== undefined} onClick={run}>
          {busy() ? "Calculando…" : "Calcular rebalanceo"}
        </button>
      </div>
      <Show when={failure()}>
        {(error) => (
          <Show
            when={REMEDIES[error().code]}
            fallback={<ErrorView error={error()} title="No se puede calcular el rebalanceo" />}
          >
            {(remedy) => <Pending action={remedy()}>{error().message}</Pending>}
          </Show>
        )}
      </Show>
      <Show when={view() !== undefined && withBucket() ? bucket() : undefined}>
        {(part) => (
          <div class="rebalance-bucket">
            <h3 class="block-title">Para el cubo, aparte del rebalanceo</h3>
            <Show
              when={part().share}
              fallback={<p class="card-note">Escribe el dinero nuevo para ver lo que le toca.</p>}
            >
              {(share) => (
                <StatLine label={`Su ${part().pct} % del total`}>
                  <Amount value={share()} />
                </StatLine>
              )}
            </Show>
            <StatLine label="Aportado al cubo">
              <Amount value={part().contributed} />
            </StatLine>
            <Show when={part().budget}>
              {(budget) => (
                <StatLine label="Presupuesto previsto hasta hoy">
                  <Amount value={budget()} />
                </StatLine>
              )}
            </Show>
            <Show when={part().room}>
              {(room) => (
                <StatLine label="Hasta el tope quedan">
                  <Amount value={room()} />
                </StatLine>
              )}
            </Show>
          </div>
        )}
      </Show>
      <Show when={view()}>{(result) => <Result view={result()} names={props.names} />}</Show>
    </>
  );

  return (
    // On a phone it waits folded: it is a yearly decision, better taken at the computer.
    <FoldSection
      title="Rebalancear"
      class="span-12"
      aside={<Tag tone="accent">Propuesta</Tag>}
      summary="Calcular un rebalanceo · mejor en el ordenador"
    >
      {body()}
    </FoldSection>
  );
};
