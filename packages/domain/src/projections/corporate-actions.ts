// A corporate action (data-schema.md §6.2, §8.5; ADR-0011): resolve the asset
// of every effect, check the sequence against the kind's row, check the
// liquidation coverage when the row asks for it, and apply the primitives in
// order. A failing effect rolls the state back, so a rejected event leaves no
// trace even when errors are collected instead of thrown.

import { ProjectionError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import type { AccountId, AssetId, CorporateActionEvent } from "../schema/events.js";
import { requireAsset } from "./catalogue.js";
import {
  checkEffectsAgainstKind,
  isLiquidation,
  type ResolvedEffect,
  targetOf,
} from "./kind-rules.js";
import { accountsHolding } from "./positions.js";
import {
  applyCarveOut,
  applyConvert,
  applyForcedSale,
  applyGrant,
  applyScale,
  type EffectContext,
  type Resolved,
} from "./primitives.js";
import type { AssetLots, FiscalLot, LedgerState } from "./state.js";

const resolveEffects = (event: CorporateActionEvent): ResolvedEffect[] =>
  event.effects.map((effect) => ({ ...effect, asset_id: effect.asset_id ?? event.asset_id }));

/** `fund_liquidation` / `issuer_liquidation`: `"all"` in exactly the accounts holding the asset. */
const requireFullCoverage = (
  state: LedgerState,
  effect: Resolved<"forced_sale">,
  eventId: Ulid,
): void => {
  const holders = accountsHolding(state, effect.asset_id);
  const listed = effect.per_account.map((entry) => entry.account_id);
  const missing = holders.filter((account) => !listed.includes(account));
  const extra = listed.filter((account) => !holders.includes(account));
  const partial = effect.per_account
    .filter((entry) => entry.quantity !== "all")
    .map((entry) => entry.account_id);
  if (missing.length > 0 || extra.length > 0 || partial.length > 0) {
    throw new ProjectionError(
      "liquidation_must_cover_all_accounts",
      eventId,
      `a liquidation sells "all" in exactly the accounts holding ${effect.asset_id}`,
      { asset_id: effect.asset_id, missing, extra, partial },
    );
  }
};

const applyEffect = (state: LedgerState, effect: ResolvedEffect, ctx: EffectContext): void => {
  switch (effect.op) {
    case "scale":
      applyScale(state, effect, ctx);
      return;
    case "convert":
      applyConvert(state, effect, ctx);
      return;
    case "carve_out":
      applyCarveOut(state, effect, ctx);
      return;
    case "forced_sale":
      applyForcedSale(state, effect, ctx);
      return;
    case "grant":
      applyGrant(state, effect, ctx);
      return;
  }
};

interface Snapshot {
  lots: Map<AssetId, AssetLots | undefined>;
  positions: LedgerState["positions"];
  cash: LedgerState["cash"];
  lotCounts: Map<Ulid, number>;
  gains: number;
  warnings: number;
}

const cloneLot = (lot: FiscalLot): FiscalLot => ({ ...lot, consumptions: [...lot.consumptions] });

/** Copies the parts of the state the primitives mutate for the given assets. */
const snapshot = (state: LedgerState, assets: readonly AssetId[]): Snapshot => ({
  lots: new Map(
    assets.map((asset) => {
      const entry = state.lots.get(asset);
      return [
        asset,
        entry === undefined
          ? undefined
          : { open: entry.open.map(cloneLot), closed: entry.closed.map(cloneLot) },
      ];
    }),
  ),
  positions: new Map(state.positions),
  cash: new Map(state.cash),
  lotCounts: new Map(state.lotCounts),
  gains: state.gains.length,
  warnings: state.warnings.length,
});

const restore = (state: LedgerState, saved: Snapshot): void => {
  for (const [asset, entry] of saved.lots) {
    if (entry === undefined) {
      state.lots.delete(asset);
    } else {
      state.lots.set(asset, entry);
    }
  }
  state.positions = saved.positions;
  state.cash = saved.cash;
  state.lotCounts = saved.lotCounts;
  state.gains.length = saved.gains;
  state.warnings.length = saved.warnings;
};

export const applyCorporateAction = (
  state: LedgerState,
  event: CorporateActionEvent,
  position: number,
): void => {
  requireAsset(state, event.asset_id, event.id);
  const effects = resolveEffects(event);
  for (const effect of effects) {
    requireAsset(state, effect.asset_id, event.id);
  }
  checkEffectsAgainstKind(event.kind, effects, event.asset_id, event.id);
  if (isLiquidation(event.kind)) {
    requireFullCoverage(state, effects[0] as Resolved<"forced_sale">, event.id);
  }
  const ctx: EffectContext = { eventId: event.id, position, effectiveDate: event.effective_date };
  const touched = [...new Set(effects.flatMap((effect) => [effect.asset_id, targetOf(effect)]))];
  const saved = snapshot(state, touched);
  try {
    for (const effect of effects) {
      applyEffect(state, effect, ctx);
    }
  } catch (error) {
    restore(state, saved);
    throw error;
  }
};

/** Accounts and assets a corporate action references (for `usage`). */
export const referencesOf = (
  event: CorporateActionEvent,
): { accounts: AccountId[]; assets: AssetId[] } => {
  const effects = resolveEffects(event);
  return {
    accounts: effects.flatMap((effect) =>
      "per_account" in effect ? effect.per_account.map((entry) => entry.account_id) : [],
    ),
    assets: [event.asset_id, ...effects.flatMap((effect) => [effect.asset_id, targetOf(effect)])],
  };
};
