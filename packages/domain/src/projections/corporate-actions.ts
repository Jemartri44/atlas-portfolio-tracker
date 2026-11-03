// A corporate action (data-schema.md §6.2, §8.5; ADR-0011): resolve the asset
// of every effect, check the sequence against the kind's row, check the
// liquidation coverage when the row asks for it, and apply the primitives in
// order. A failing effect rolls the state back, so a rejected event leaves no
// trace even when errors are collected instead of thrown.

import { ProjectionError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import type { AccountId, AssetId, CorporateActionEvent } from "../schema/events.js";
import { euRegulatedMarket } from "../tax/boxes/markets.js";
import { requireAsset } from "./catalogue.js";
import type { CurrencyLots } from "./currency-lots.js";
import {
  checkCostAdjustmentRegime,
  checkEffectsAgainstKind,
  isLiquidation,
  type ResolvedEffect,
  targetOf,
} from "./kind-rules.js";
import { accountsHolding } from "./positions.js";
import {
  applyCarveOut,
  applyConvert,
  applyCostAdjustment,
  applyForcedSale,
  applyGrant,
  applyScale,
  type EffectContext,
  type Resolved,
} from "./primitives.js";
import { type AssetLots, addWarning, type FiscalLot, type LedgerState } from "./state.js";

/**
 * Arts. 25.1.e and 33.3.a LIRPF lower the cost only for shares of an EU
 * regulated market. In a collective investment undertaking the premium is
 * income whole and a return of contributions has its own limit (art. 94.1.c
 * and d); for any other share the premium is income up to the difference in
 * equity, a figure the ledger does not hold. Neither is modelled.
 */
const requireEuShareForCapitalReturn = (state: LedgerState, event: CorporateActionEvent): void => {
  const asset = requireAsset(state, event.asset_id, event.id);
  if (event.kind !== "capital_return") {
    return;
  }
  if (asset.asset_type !== "stock") {
    throw new ProjectionError(
      "capital_return_needs_stock",
      event.id,
      `a capital_return applies to shares, not to a ${asset.asset_type}`,
      { asset_id: asset.asset_id, asset_type: asset.asset_type },
    );
  }
  const eu = euRegulatedMarket(asset.market);
  if (eu !== true) {
    const written = (asset.market ?? "").trim() !== "";
    const reason = eu === false ? "not_eu" : written ? "market_unknown" : "market_missing";
    throw new ProjectionError(
      "capital_return_needs_eu_listed",
      event.id,
      "a capital_return lowers the cost only of shares listed on an EU regulated market",
      { asset_id: asset.asset_id, market: asset.market ?? null, reason },
    );
  }
};

/** Every account holding the asset should get its cash: the FIFO is global. */
const warnUncoveredHolders = (
  state: LedgerState,
  event: CorporateActionEvent,
  effects: readonly ResolvedEffect[],
): void => {
  if (event.kind !== "capital_return") {
    return;
  }
  // The kind's row admits a single cost_adjustment.
  const [effect] = effects as [Resolved<"cost_adjustment">];
  const listed = new Set(effect.per_account.map((entry) => entry.account_id));
  const missing = accountsHolding(state, event.asset_id).filter((account) => !listed.has(account));
  if (missing.length > 0) {
    addWarning(
      state,
      "capital_return_partial_accounts",
      event.id,
      `the capital_return names no cash for every account holding ${event.asset_id}`,
      { asset_id: event.asset_id, missing },
    );
  }
};

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
    case "cost_adjustment":
      applyCostAdjustment(state, effect, ctx);
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
  /**
   * The acquisitions a `grant` notes for the wash-sale rule and the income in
   * kind it records. They were left out, so a rejected action kept both: a
   * phantom acquisition that a real loss could be deferred against, and a
   * phantom line of `in_kind_income` in the snapshot. Both lists only grow
   * while an event applies, so their lengths are enough to put them back.
   */
  acquisitions: Map<AssetId, number>;
  inKindIncome: number;
  /** The excess of a `capital_return` is income; the list only grows. */
  income: number;
  /** The lot journal only grows too. */
  lotJournal: number;
  /** A forced sale in a foreign currency also opens currency lots and may impute a difference. */
  currencyLots: Map<string, CurrencyLots>;
  currencyLotCounts: Map<Ulid, number>;
  currencyGains: number;
  currencyJournal: number;
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
  acquisitions: new Map(
    assets.map((asset) => [asset, state.acquisitions.get(asset)?.length ?? 0] as const),
  ),
  inKindIncome: state.inKindIncome.length,
  income: state.income.length,
  lotJournal: state.lotJournal.length,
  currencyLots: new Map(
    [...state.currencyLots].map(([currency, entry]) => [
      currency,
      {
        open: entry.open.map((lot) => ({ ...lot })),
        closed: entry.closed.map((lot) => ({ ...lot })),
      },
    ]),
  ),
  currencyLotCounts: new Map(state.currencyLotCounts),
  currencyGains: state.currencyGains.length,
  currencyJournal: state.currencyJournal.length,
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
  for (const [asset, length] of saved.acquisitions) {
    if (length === 0) {
      state.acquisitions.delete(asset);
    } else {
      (state.acquisitions.get(asset) as unknown[]).length = length;
    }
  }
  state.inKindIncome.length = saved.inKindIncome;
  state.income.length = saved.income;
  state.lotJournal.length = saved.lotJournal;
  state.currencyLots = saved.currencyLots;
  state.currencyLotCounts = saved.currencyLotCounts;
  state.currencyGains.length = saved.currencyGains;
  state.currencyJournal.length = saved.currencyJournal;
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
  checkCostAdjustmentRegime(event.kind, effects, event.neutrality_regime, event.id);
  requireEuShareForCapitalReturn(state, event);
  if (isLiquidation(event.kind)) {
    requireFullCoverage(state, effects[0] as Resolved<"forced_sale">, event.id);
  }
  const ctx: EffectContext = {
    eventId: event.id,
    kind: event.kind,
    position,
    effectiveDate: event.effective_date,
    scaleOnly: effects.every((effect) => effect.op === "scale"),
  };
  const touched = [...new Set(effects.flatMap((effect) => [effect.asset_id, targetOf(effect)]))];
  const saved = snapshot(state, touched);
  warnUncoveredHolders(state, event, effects);
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
