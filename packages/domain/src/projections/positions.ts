// Physical positions: quantity per (account, asset). What each broker shows and
// what gets reconciled (ADR-0009). Never negative.

import { ProjectionError } from "../errors.js";
import { Quantity } from "../money/quantity.js";
import type { AccountId, AssetId } from "../schema/events.js";
import { type LedgerState, positionKey } from "./state.js";

export interface PhysicalPosition {
  account_id: AccountId;
  asset_id: AssetId;
  quantity: Quantity;
}

export const positionOf = (state: LedgerState, accountId: AccountId, assetId: AssetId): Quantity =>
  state.positions.get(positionKey(accountId, assetId)) ?? Quantity.ZERO;

export const adjustPosition = (
  state: LedgerState,
  accountId: AccountId,
  assetId: AssetId,
  delta: Quantity,
  eventId: string,
): Quantity => {
  const next = positionOf(state, accountId, assetId).add(delta);
  if (next.isNegative()) {
    throw new ProjectionError(
      "insufficient_position",
      eventId,
      `account ${accountId} holds ${next.sub(delta).toString()} of ${assetId}; cannot remove ${delta.value.neg().toString()}`,
      { account_id: accountId, asset_id: assetId, available: next.sub(delta).toString() },
    );
  }
  state.positions.set(positionKey(accountId, assetId), next);
  return next;
};

/** Accounts holding a positive quantity of the asset. */
export const accountsHolding = (state: LedgerState, assetId: AssetId): AccountId[] => {
  const holders: AccountId[] = [];
  for (const [key, quantity] of state.positions) {
    const [accountId, keyAsset] = key.split("|") as [AccountId, AssetId];
    if (keyAsset === assetId && quantity.isPositive()) {
      holders.push(accountId);
    }
  }
  return holders;
};

export const physicalPositions = (state: LedgerState): PhysicalPosition[] => {
  const result: PhysicalPosition[] = [];
  for (const [key, quantity] of state.positions) {
    if (!quantity.isZero()) {
      const [account_id, asset_id] = key.split("|") as [AccountId, AssetId];
      result.push({ account_id, asset_id, quantity });
    }
  }
  return result;
};
