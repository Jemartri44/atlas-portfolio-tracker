// The projection (data-schema.md §7.1): pass 0 indexes ids, reversals and
// reserved types; pass A applies catalogue and settings in file order; pass B
// applies operations and tracking in chronological order (business date, then
// file position). In `collectErrors` mode invalid events are recorded and
// skipped instead of aborting, so rectification can list everything affected.

import type { CivilDate } from "../dates/civil-date.js";
import { DomainError, ProjectionError, UnsupportedEventError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import { isReservedEventType } from "../schema/envelope.js";
import type {
  AccountCreatedEvent,
  AccountUpdatedEvent,
  AssetCreatedEvent,
  AssetUpdatedEvent,
  LedgerEvent,
  ReversalEvent,
  SettingsChangedEvent,
  SupportedEvent,
  ThesisClosedEvent,
  ThesisOpenedEvent,
} from "../schema/events.js";
import { fiscalDateOf } from "../settings/fiscal-date.js";
import { DEFAULT_SETTINGS, type Settings } from "../settings/settings.js";
import {
  applyAccountCreated,
  applyAccountUpdated,
  applyAssetCreated,
  applyAssetUpdated,
} from "./catalogue.js";
import { applyCorporateAction, referencesOf } from "./corporate-actions.js";
import {
  applyBuy,
  applyCashDeposit,
  applyCashWithdrawal,
  applyDividend,
  applyFxExchange,
  applyInterest,
  applySell,
  applyStandaloneFee,
  applyTransfer,
  applyValuation,
} from "./operations.js";
import {
  applyOrderPlaced,
  applyOrderUpdated,
  applyTransferRequested,
  applyTransferRequestUpdated,
} from "./pending.js";
import { applySettingsChanged, resolveFiscalSettings } from "./settings-at.js";
import { createEmptyState, type LedgerState } from "./state.js";

export interface ProjectOptions {
  /** Settings used to derive fiscal dates; defaults to the latest `settings_changed` (Q3). */
  settings?: Settings;
  /** Record invalid events in `state.invalid` and continue instead of throwing. */
  collectErrors?: boolean;
}

export type CatalogueEvent =
  | AccountCreatedEvent
  | AccountUpdatedEvent
  | AssetCreatedEvent
  | AssetUpdatedEvent
  | SettingsChangedEvent;

/** Types of feature 002 not yet projected; each task removes its own. */
const PENDING_TYPES = new Set<string>(["thesis_opened", "thesis_closed"]);

const isPending = (type: string): boolean => isReservedEventType(type) || PENDING_TYPES.has(type);

/** Events with a business date: everything except catalogue, settings, theses and reversals. */
export type OperationEvent = Exclude<
  SupportedEvent,
  CatalogueEvent | ReversalEvent | ThesisOpenedEvent | ThesisClosedEvent
>;

interface Positioned<E extends SupportedEvent = SupportedEvent> {
  event: E;
  position: number;
}

const CATALOGUE_TYPES = new Set<string>([
  "account_created",
  "account_updated",
  "asset_created",
  "asset_updated",
  "settings_changed",
]);

const isCatalogue = (entry: Positioned): entry is Positioned<CatalogueEvent> =>
  CATALOGUE_TYPES.has(entry.event.type);

export const isOperationEvent = (event: LedgerEvent): event is OperationEvent =>
  !CATALOGUE_TYPES.has(event.type) && event.type !== "reversal" && !isPending(event.type);

const isOperation = (entry: Positioned): entry is Positioned<OperationEvent> =>
  isOperationEvent(entry.event);

/** Domain errors raised while applying an event become projection errors; anything else is a bug and propagates. */
export const toProjectionError = (event: LedgerEvent, error: unknown): ProjectionError => {
  if (error instanceof ProjectionError) {
    return error;
  }
  if (error instanceof DomainError) {
    return new ProjectionError(error.code, event.id, error.message, { ...error.details });
  }
  throw error;
};

/** Business date that orders pass B (data-schema.md §7.1). */
export const businessDateOf = (state: LedgerState, event: OperationEvent): CivilDate => {
  switch (event.type) {
    case "buy":
    case "sell": {
      const asset = state.assets.get(event.asset_id);
      return asset === undefined
        ? event.value_date
        : fiscalDateOf(event, asset.asset_type, state.fiscalSettings);
    }
    case "transfer":
      return event.value_date_out;
    case "dividend":
    case "interest":
    case "fx_exchange":
    case "cash_deposit":
    case "cash_withdrawal":
    case "standalone_fee":
      return event.value_date;
    case "valuation":
    case "order_updated":
    case "transfer_request_updated":
      return event.date;
    case "order_placed":
    case "transfer_requested":
      return event.requested_date;
    case "corporate_action":
      return event.effective_date;
  }
};

/** Stable chronological order: (business date, file position). */
export const orderForProjection = (
  state: LedgerState,
  events: readonly Positioned<OperationEvent>[],
): Positioned<OperationEvent>[] =>
  events
    .map((entry) => ({ ...entry, date: businessDateOf(state, entry.event) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.position - b.position));

const recordUsage = (state: LedgerState, event: SupportedEvent): void => {
  const { accounts, assets } = state.usage;
  switch (event.type) {
    case "buy":
    case "sell":
    case "dividend":
    case "valuation":
    case "order_placed":
      accounts.add(event.account_id);
      assets.add(event.asset_id);
      break;
    case "interest":
    case "fx_exchange":
    case "cash_deposit":
    case "cash_withdrawal":
    case "standalone_fee":
      accounts.add(event.account_id);
      break;
    case "transfer":
    case "transfer_requested":
      accounts.add(event.from_account_id);
      accounts.add(event.to_account_id);
      assets.add(event.from_asset_id);
      assets.add(event.to_asset_id);
      break;
    case "corporate_action": {
      const references = referencesOf(event);
      for (const account of references.accounts) {
        accounts.add(account);
      }
      for (const asset of references.assets) {
        assets.add(asset);
      }
      break;
    }
    default:
      break;
  }
};

const applyOperation = (state: LedgerState, event: OperationEvent, position: number): void => {
  switch (event.type) {
    case "buy":
      applyBuy(state, event, position);
      return;
    case "sell":
      applySell(state, event);
      return;
    case "transfer":
      applyTransfer(state, event);
      return;
    case "dividend":
      applyDividend(state, event);
      return;
    case "interest":
      applyInterest(state, event);
      return;
    case "fx_exchange":
      applyFxExchange(state, event);
      return;
    case "cash_deposit":
      applyCashDeposit(state, event);
      return;
    case "cash_withdrawal":
      applyCashWithdrawal(state, event);
      return;
    case "standalone_fee":
      applyStandaloneFee(state, event);
      return;
    case "valuation":
      applyValuation(state, event);
      return;
    case "order_placed":
      applyOrderPlaced(state, event);
      return;
    case "order_updated":
      applyOrderUpdated(state, event);
      return;
    case "transfer_requested":
      applyTransferRequested(state, event);
      return;
    case "transfer_request_updated":
      applyTransferRequestUpdated(state, event);
      return;
    case "corporate_action":
      applyCorporateAction(state, event, position);
      return;
  }
};

const applyCatalogue = (state: LedgerState, event: CatalogueEvent): void => {
  switch (event.type) {
    case "account_created":
      applyAccountCreated(state, event);
      return;
    case "account_updated":
      applyAccountUpdated(state, event);
      return;
    case "asset_created":
      applyAssetCreated(state, event);
      return;
    case "asset_updated":
      applyAssetUpdated(state, event);
      return;
    case "settings_changed":
      applySettingsChanged(state, event);
      return;
  }
};

export const projectLedger = (
  events: readonly LedgerEvent[],
  options: ProjectOptions = {},
): LedgerState => {
  const collect = options.collectErrors === true;
  const state = createEmptyState(DEFAULT_SETTINGS);
  const skipped = new Set<Ulid>();

  const reject = (event: LedgerEvent, error: unknown): void => {
    const projectionError = toProjectionError(event, error);
    if (!collect) {
      throw projectionError;
    }
    state.invalid.push({ event, error: projectionError });
    skipped.add(event.id);
  };

  const guarded = (event: LedgerEvent, apply: () => void): void => {
    try {
      apply();
    } catch (error) {
      reject(event, error);
    }
  };

  // Pass 0: index, reserved types, reversals, corrections.
  events.forEach((event, position) => {
    if (state.positionOf.has(event.id)) {
      throw new ProjectionError("duplicate_id", event.id, `event id ${event.id} appears twice`);
    }
    state.positionOf.set(event.id, position);
  });
  for (const event of events) {
    if (isPending(event.type)) {
      reject(event, new UnsupportedEventError(event.type, event.id));
      continue;
    }
    if (event.type === "reversal") {
      skipped.add(event.id);
      guarded(event, () => applyReversal(state, events, event));
    }
  }
  for (const event of events) {
    if (event.corrects_id !== undefined && !state.reversed.has(event.corrects_id)) {
      reject(
        event,
        new ProjectionError(
          "dangling_correction",
          event.id,
          `corrects_id ${event.corrects_id} does not point to a reversed event`,
          { corrects_id: event.corrects_id },
        ),
      );
    }
  }

  const active: Positioned[] = [];
  events.forEach((event, position) => {
    if (skipped.has(event.id) || state.reversed.has(event.id)) {
      return;
    }
    const supported = event as SupportedEvent;
    recordUsage(state, supported);
    const fingerprint = (supported as { fingerprint?: string }).fingerprint;
    if (fingerprint !== undefined) {
      state.fingerprints.set(fingerprint, [
        ...(state.fingerprints.get(fingerprint) ?? []),
        event.id,
      ]);
    }
    active.push({ event: supported, position });
  });

  // Pass A: catalogue and settings, in file order.
  for (const entry of active.filter(isCatalogue)) {
    guarded(entry.event, () => applyCatalogue(state, entry.event));
  }
  state.fiscalSettings = resolveFiscalSettings(state.settingsHistory, options.settings);

  // Pass B: operations and tracking, in chronological order.
  for (const entry of orderForProjection(state, active.filter(isOperation))) {
    guarded(entry.event, () => applyOperation(state, entry.event, entry.position));
  }
  return state;
};

const applyReversal = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  event: ReversalEvent,
): void => {
  const position = state.positionOf.get(event.reverses_id);
  if (position === undefined) {
    throw new ProjectionError(
      "reversal_target_missing",
      event.id,
      `reversal targets unknown event ${event.reverses_id}`,
      { reverses_id: event.reverses_id },
    );
  }
  const target = events[position] as LedgerEvent;
  if (target.type === "reversal") {
    throw new ProjectionError(
      "reversal_of_reversal",
      event.id,
      "a reversal cannot be reversed; record the original event again",
      { reverses_id: event.reverses_id },
    );
  }
  if (state.reversed.has(event.reverses_id)) {
    throw new ProjectionError(
      "already_reversed",
      event.id,
      `event ${event.reverses_id} is already reversed`,
      { reverses_id: event.reverses_id, by: state.reversed.get(event.reverses_id) },
    );
  }
  state.reversed.set(event.reverses_id, event.id);
};
