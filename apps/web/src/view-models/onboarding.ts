// The first steps of an empty ledger, each with its state (D4 of
// docs/design/system.md): an account, an asset, the target weights and the
// first purchase. They are shown until the first purchase; after it the
// summary has figures of its own to say.
//
// Every state is read from the ledger, never remembered: a step is done
// because the data is there, and it goes back to pending if the event that
// did it is reversed.

import type { LedgerEntry, LedgerState, Settings } from "@atlas/domain";

export type StepKey = "account" | "asset" | "weights" | "buy";

export interface OnboardingStep {
  key: StepKey;
  title: string;
  /** What the step asks for, or what is already there when it is done. */
  text: string;
  done: boolean;
  action: { label: string; to: string };
}

export interface Onboarding {
  steps: OnboardingStep[];
  /** How many are done, for "1 de 4". */
  done: number;
  /** The first step not done: the one with the main button. */
  current?: StepKey | undefined;
}

const first = <T>(values: Iterable<T>): T | undefined => {
  for (const value of values) {
    return value;
  }
  return undefined;
};

/**
 * `undefined` once there is a purchase in force: from then on the summary is
 * the patrimony, not a checklist.
 */
export const onboardingOf = (
  state: LedgerState,
  entries: readonly LedgerEntry[],
  settings: Settings,
): Onboarding | undefined => {
  const bought = entries.some(
    (entry) =>
      entry.event.type === "buy" &&
      entry.status !== "reversed" &&
      entry.invalid_reason === undefined,
  );
  if (bought) {
    return undefined;
  }
  const account = first(state.accounts.values());
  const asset = first(state.assets.values());
  const weights = Object.keys(settings.target_weights ?? {}).length > 0;
  const steps: OnboardingStep[] = [
    {
      key: "account",
      title: "Da de alta la cuenta donde inviertes",
      text:
        account === undefined
          ? "El bróker o la gestora, con su plataforma y su divisa."
          : `Hecho: ${account.name} · ${account.platform}.`,
      done: account !== undefined,
      action: { label: "Alta de cuenta", to: "/registrar/cuenta" },
    },
    {
      key: "asset",
      title: "Da de alta el primer activo",
      text:
        asset === undefined
          ? "El fondo o el ETF que compras cada mes, con su tipo de activo."
          : `Hecho: ${asset.name}.`,
      done: asset !== undefined,
      action: { label: "Alta de activo", to: "/registrar/activo" },
    },
    {
      key: "weights",
      title: "Fija los pesos objetivo",
      text: weights
        ? "Hecho: la cartera principal ya tiene sus pesos objetivo."
        : "Cuánto quieres de cada activo de la cartera principal. Suman 100.",
      done: weights,
      action: { label: "Ir a los pesos objetivo", to: "/ajustes/configuracion" },
    },
    {
      key: "buy",
      title: "Registra tu primera compra",
      text: "Cuatro datos: cuenta, activo, cantidad e importe.",
      done: false,
      action: { label: "Registrar una compra", to: "/registrar/buy" },
    },
  ];
  return {
    steps,
    done: steps.filter((step) => step.done).length,
    current: steps.find((step) => !step.done)?.key,
  };
};
