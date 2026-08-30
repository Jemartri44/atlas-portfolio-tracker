// Accounts and assets (data-schema.md §6.1, §7). `*_updated` events carry the
// full resulting state; previous identifiers go to `identifier_history`.

import { ProjectionError } from "../errors.js";
import type {
  AccountCreatedEvent,
  AccountId,
  AccountUpdatedEvent,
  AssetCreatedEvent,
  AssetId,
  AssetUpdatedEvent,
} from "../schema/events.js";
import type { Account, Asset, LedgerState } from "./state.js";

export const requireAccount = (state: LedgerState, id: AccountId, eventId: string): Account => {
  const account = state.accounts.get(id);
  if (account === undefined) {
    throw new ProjectionError("unknown_account", eventId, `account ${id} does not exist`, {
      account_id: id,
    });
  }
  return account;
};

export const requireAsset = (state: LedgerState, id: AssetId, eventId: string): Asset => {
  const asset = state.assets.get(id);
  if (asset === undefined) {
    throw new ProjectionError("unknown_asset", eventId, `asset ${id} does not exist`, {
      asset_id: id,
    });
  }
  return asset;
};

export const applyAccountCreated = (state: LedgerState, event: AccountCreatedEvent): void => {
  if (state.accounts.has(event.account_id)) {
    throw new ProjectionError(
      "duplicate_account",
      event.id,
      `account ${event.account_id} already exists`,
      { account_id: event.account_id },
    );
  }
  const { type: _type, id, recorded_at: _recordedAt, schema_version: _version, ...fields } = event;
  state.accounts.set(event.account_id, { ...fields, history: [id] });
};

export const applyAccountUpdated = (state: LedgerState, event: AccountUpdatedEvent): void => {
  const current = requireAccount(state, event.account_id, event.id);
  if (current.book !== event.book && state.usage.accounts.has(event.account_id)) {
    throw new ProjectionError(
      "account_book_change",
      event.id,
      `account ${event.account_id} has operations; its book cannot change`,
      { account_id: event.account_id, from: current.book, to: event.book },
    );
  }
  const { type: _type, id, recorded_at: _recordedAt, schema_version: _version, ...fields } = event;
  state.accounts.set(event.account_id, { ...fields, history: [...current.history, id] });
};

export const applyAssetCreated = (state: LedgerState, event: AssetCreatedEvent): void => {
  if (state.assets.has(event.asset_id)) {
    throw new ProjectionError(
      "duplicate_asset",
      event.id,
      `asset ${event.asset_id} already exists`,
      {
        asset_id: event.asset_id,
      },
    );
  }
  const {
    type: _type,
    id: _id,
    recorded_at: _recordedAt,
    schema_version: _version,
    ...fields
  } = event;
  state.assets.set(event.asset_id, { ...fields, identifier_history: [] });
};

export const applyAssetUpdated = (state: LedgerState, event: AssetUpdatedEvent): void => {
  const current = requireAsset(state, event.asset_id, event.id);
  if (current.book !== event.book) {
    throw new ProjectionError(
      "asset_book_change",
      event.id,
      `asset ${event.asset_id} cannot move between books; create a new asset`,
      { asset_id: event.asset_id, from: current.book, to: event.book },
    );
  }
  const history = [...current.identifier_history];
  if (current.isin !== event.isin || current.ticker !== event.ticker) {
    history.push({
      ...(current.isin === undefined ? {} : { isin: current.isin }),
      ...(current.ticker === undefined ? {} : { ticker: current.ticker }),
      until_event_id: event.id,
    });
  }
  const {
    type: _type,
    id: _id,
    recorded_at: _recordedAt,
    schema_version: _version,
    ...fields
  } = event;
  state.assets.set(event.asset_id, { ...fields, identifier_history: history });
};

/** Core and bucket never mix (constitution III, ADR-0009). */
export const assertSameBook = (account: Account, asset: Asset, eventId: string): void => {
  if (account.book !== asset.book) {
    throw new ProjectionError(
      "book_mismatch",
      eventId,
      `account ${account.account_id} (${account.book}) and asset ${asset.asset_id} (${asset.book}) belong to different books`,
      { account_id: account.account_id, asset_id: asset.asset_id },
    );
  }
};

export const accounts = (state: LedgerState): Account[] => [...state.accounts.values()];

export const assets = (state: LedgerState): Asset[] => [...state.assets.values()];
