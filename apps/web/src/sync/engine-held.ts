// What the sync of this browser holds back, and the three resolutions (feature
// 015, E4): confirm, discard and redo — the plan first, with its ids sealed,
// recorded only once the user confirmed it. Beside the engine, and like it
// imported only by the section of the sync in Ajustes (review of PR #97, N1).

import {
  confirmHeldUnit,
  discardHeldUnit,
  finishRedo,
  type HeldView,
  heldUnits,
  recordRedoPlan,
  redoRecorded,
  startRedo,
} from "@atlas/adapters/sync-client";
import {
  CURRENT_LEDGER_SCHEMA,
  createUlidGenerator,
  decodeLines,
  type LedgerEvent,
  type UseCaseDeps,
} from "@atlas/domain";
import type { RedoPlan, Resolution } from "@atlas/domain/sync";
import { optionsOf, storeOf, type WebSyncEnv } from "./engine.js";

export const heldList = (env: WebSyncEnv): Promise<HeldView[]> =>
  heldUnits(storeOf(env), optionsOf(env));

/** A held unit as the card shows it: why, what can be done, and its operations. */
export interface HeldItem {
  readonly unit: string;
  readonly reason: { readonly code: string; readonly details: Readonly<Record<string, unknown>> };
  readonly resolutions: readonly Resolution[];
  /** Each line read, or `undefined` when it cannot be read — held for exactly that. */
  readonly events: readonly (LedgerEvent | undefined)[];
}

const readable = (line: string): LedgerEvent | undefined => {
  try {
    return decodeLines([line], CURRENT_LEDGER_SCHEMA)[0];
  } catch {
    return undefined;
  }
};

export const heldItems = async (env: WebSyncEnv): Promise<HeldItem[]> =>
  (await heldList(env)).map((view) => ({
    unit: view.unit.unit,
    reason: view.unit.reason,
    resolutions: view.resolutions,
    events: view.unit.lines.map(readable),
  }));

export const confirmHeld = (env: WebSyncEnv, unit: string): Promise<void> =>
  confirmHeldUnit(storeOf(env), unit, optionsOf(env));

export const discardHeld = (
  env: WebSyncEnv,
  unit: string,
  only: "unit" | "reversal" = "unit",
): Promise<void> => discardHeldUnit(storeOf(env), unit, optionsOf(env), only);

/**
 * Rehacer, first half: the plan, with its ids sealed, for the user to see
 * before anything is recorded — or `recorded`, when a redo cut between
 * recording and finishing is already in the ledger by those ids, which only
 * finishes (review of PR #96, N1).
 */
export const planRedo = async (
  env: WebSyncEnv,
  deps: UseCaseDeps,
  unit: string,
): Promise<{ readonly plan: RedoPlan } | { readonly recorded: true }> => {
  const store = storeOf(env);
  const options = optionsOf(env);
  const ids = createUlidGenerator(deps);
  const plan = await startRedo(store, unit, () => ids.next(), options);
  if (await redoRecorded(store, unit, options)) {
    await finishRedo(store, unit, options);
    return { recorded: true };
  }
  return { plan };
};

/** Rehacer, second half, once the user confirmed the plan: exactly the sealed plan, then finished. */
export const recordPlannedRedo = async (
  env: WebSyncEnv,
  deps: UseCaseDeps,
  unit: string,
  plan: RedoPlan,
  confirmDuplicate: boolean,
): Promise<void> => {
  await recordRedoPlan(deps, plan, { confirmDuplicate });
  await finishRedo(storeOf(env), unit, optionsOf(env));
};
