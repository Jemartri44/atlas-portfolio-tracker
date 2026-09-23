// The projection (data-schema.md §7.1): pass 0 indexes ids, reversals and
// reserved types; pass A applies catalogue and settings in file order, then
// the bucket theses (pass A', also in file order); pass B applies operations
// and tracking in chronological order (business date, then file position);
// the closing step adds the thesis warnings that need the final positions. In `collectErrors` mode invalid events are recorded and
// skipped instead of aborting, so rectification can list everything affected.
// With `asOf`, pass B stops at that business date: a view of a past date must
// not be computed on a state that already contains the future.

import type { CivilDate } from "../dates/civil-date.js";
import { madridDateOf } from "../dates/madrid.js";
import { DomainError, ProjectionError, UnsupportedEventError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import { isReservedEventType } from "../schema/envelope.js";
import type {
  AccountCreatedEvent,
  AccountUpdatedEvent,
  AssetCreatedEvent,
  AssetUpdatedEvent,
  FilingFingerprintWaivedEvent,
  LedgerEvent,
  ReversalEvent,
  SettingsChangedEvent,
  SupportedEvent,
  TaxReturnFiledEvent,
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
import { applyTaxReturnFiled } from "./filings.js";
import { noteFxRates } from "./fx-rates.js";
import {
  applyBuy,
  applyCashDeposit,
  applyCashWithdrawal,
  applyDividend,
  applyFxExchange,
  applyInterest,
  applySell,
  applyStandaloneFee,
  applySwap,
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
import { applyThesisClosed, applyThesisOpened, thesisWarnings } from "./theses.js";

export interface ProjectOptions {
  /** Settings used to derive fiscal dates; defaults to the latest `settings_changed` (Q3). */
  settings?: Settings;
  /** Record invalid events in `state.invalid` and continue instead of throwing. */
  collectErrors?: boolean;
  /**
   * Cuts pass B at a business date: every operation and tracking event dated
   * after it is ignored, so the state is the portfolio as it stood that day and
   * not the latest one read with old prices (data-schema.md §7). Pass A is
   * unaffected: the catalogue, the settings and the theses are applied whole,
   * because a reference is resolved against the complete catalogue (§7.1).
   */
  asOf?: CivilDate;
}

export type CatalogueEvent =
  | AccountCreatedEvent
  | AccountUpdatedEvent
  | AssetCreatedEvent
  | AssetUpdatedEvent
  | SettingsChangedEvent;

export type ThesisEvent = ThesisOpenedEvent | ThesisClosedEvent;

const THESIS_TYPES = new Set<string>(["thesis_opened", "thesis_closed"]);

const isThesis = (entry: Positioned): entry is Positioned<ThesisEvent> =>
  THESIS_TYPES.has(entry.event.type);

const isFiling = (entry: Positioned): entry is Positioned<TaxReturnFiledEvent> =>
  entry.event.type === "tax_return_filed";

/**
 * Events with a business date: everything except catalogue, settings, theses,
 * filed returns and reversals. A filing is an administrative document, like a
 * thesis: it is filtered by `filed_at` and not by the cut of `asOf` (ADR-0016).
 */
export type OperationEvent = Exclude<
  SupportedEvent,
  | CatalogueEvent
  | ReversalEvent
  | ThesisOpenedEvent
  | ThesisClosedEvent
  | TaxReturnFiledEvent
  | FilingFingerprintWaivedEvent
>;

interface Positioned<E extends SupportedEvent = SupportedEvent> {
  event: E;
  position: number;
}

/** A pass-B event with its business date already resolved. */
export interface DatedOperation extends Positioned<OperationEvent> {
  date: CivilDate;
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
  !CATALOGUE_TYPES.has(event.type) &&
  event.type !== "reversal" &&
  event.type !== "tax_return_filed" &&
  // An administrative document too, like a filing: no business date, and the
  // cut of `asOf` does not reach it (ADR-0025, ADR-0016).
  event.type !== "filing_fingerprint_waived" &&
  !THESIS_TYPES.has(event.type) &&
  !isReservedEventType(event.type);

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
    case "swap": {
      // Ordered by the fiscal date of the leg **handed over**, which is the one
      // of the taxable event. The lot received is born on its own (§7.1 and
      // `applySwap`), and when the two differ the projection says so.
      const from = state.assets.get(event.from_asset_id);
      return from === undefined
        ? event.value_date
        : fiscalDateOf(event, from.asset_type, state.fiscalSettings);
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
): DatedOperation[] =>
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
    case "thesis_opened":
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
    case "swap":
      accounts.add(event.account_id);
      assets.add(event.from_asset_id);
      assets.add(event.to_asset_id);
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
      applySell(state, event, position);
      return;
    case "swap":
      applySwap(state, event, position);
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
    if (isReservedEventType(event.type)) {
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

  // Pass A': bucket theses, in file order, against the complete catalogue.
  for (const entry of active.filter(isThesis)) {
    guarded(entry.event, () =>
      entry.event.type === "thesis_opened"
        ? applyThesisOpened(state, entry.event, entry.position)
        : applyThesisClosed(state, entry.event, entry.position),
    );
  }

  // Pass A'': filed returns, in file order. After the catalogue, because the
  // assets of a 720 name accounts and assets, and after the theses only
  // because nothing links them: a filing is a document, not an operation, and
  // each query filters it by its own `filed_at` (ADR-0016).
  for (const entry of active.filter(isFiling)) {
    guarded(entry.event, () => applyTaxReturnFiled(state, entry.event, entry.position));
  }

  // And the waivers of a fingerprint nobody could verify, which are documents
  // about a filing and are read in the same pass (ADR-0025).
  //
  // The filing a waiver names has to be **in the file**, not necessarily in
  // force: a reversed filing is still checked by `compact`, so a waiver for it
  // is the only way out and stays valid. A waiver of something that is not in
  // the file at all is a waiver of nothing, and it is invalid.
  const filingIds = new Set(
    events.filter((event) => event.type === "tax_return_filed").map((event) => event.id),
  );
  for (const entry of active) {
    if (entry.event.type !== "filing_fingerprint_waived") {
      continue;
    }
    const waiver = entry.event;
    guarded(waiver, () => {
      if (!filingIds.has(waiver.filing_id)) {
        throw new ProjectionError(
          "waiver_filing_unknown",
          waiver.id,
          `waiver names filing ${waiver.filing_id}, which is not in the file`,
          { filing_id: waiver.filing_id },
        );
      }
      state.fingerprintWaivers.set(waiver.id, {
        waiver_id: waiver.id,
        filing_id: waiver.filing_id,
        reason: waiver.reason,
        declared_schema_version: waiver.declared_schema_version,
        declared_lines: waiver.declared_lines,
        accepted_on: madridDateOf(waiver.recorded_at),
      });
    });
  }

  // Pass B: operations and tracking, in chronological order. With `asOf`, what
  // happens after that date simply has not happened yet: it enters no lot, no
  // position, no cash, no gain, no pending order, no valuation and no warning.
  for (const entry of orderForProjection(state, active.filter(isOperation))) {
    if (options.asOf !== undefined && entry.date > options.asOf) {
      continue;
    }
    guarded(entry.event, () => {
      applyOperation(state, entry.event, entry.position);
      // After applying, never before: an event the projection rejected must not
      // date a currency either.
      noteFxRates(state, entry.event, entry.date);
    });
  }
  thesisWarnings(state, options.asOf);
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
  // **A waiver cannot be reversed** (ADR-0025, as amended). It records
  // something that already happened —the ledger was compacted without
  // verifying that fingerprint— and what happened is not undone by annulling
  // the line that tells it: the compaction stays compacted. Accepting it made
  // `check` answer "sin hallazgos" afterwards, which turned the way out into a
  // way of cleaning the record.
  if (target.type === "filing_fingerprint_waived") {
    throw new ProjectionError(
      "waiver_not_reversible",
      event.id,
      "a waiver records a compaction that already happened; it cannot be reversed",
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
