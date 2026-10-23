// The deferral of a transfer exists only between investment funds (article
// 94.1.a LIRPF, business-rules.md §5.2) and only for a Spanish tax resident.
// The free `transferable` flag alone never grants it.

import { madridDateOf } from "../dates/madrid.js";
import { ProjectionError } from "../errors.js";
import type { IsoInstant } from "../schema/envelope.js";
import type { AssetType } from "../schema/events.js";
import { DEFAULT_TAX_RESIDENCE, taxResidenceOf } from "../settings/settings.js";
import { settingsAt } from "./settings-at.js";
import { addWarning, type LedgerState } from "./state.js";

const DEFERRAL_TYPES: readonly AssetType[] = ["fund", "money_market"];

export const allowsDeferral = (assetType: AssetType): boolean => DEFERRAL_TYPES.includes(assetType);

/**
 * `not_transferable` is the asset's own flag and always fails. The other two
 * are the rule of the law: they fail when recording and are only a warning
 * when a ledger is replayed, so that a book written before the rule still
 * opens (business-rules.md §5.2).
 */
export interface TransferBlock {
  code: "not_transferable" | "transfer_not_between_funds" | "transfer_not_resident";
  message: string;
  details: Record<string, unknown>;
}

interface TransferEnd {
  asset_id: string;
  asset_type: AssetType;
  transferable: boolean;
}

/** Codes that are refused on entry but tolerated on replay. */
export const RECORD_ONLY_BLOCKS: readonly string[] = [
  "transfer_not_between_funds",
  "transfer_not_resident",
];

const isSpanish = (taxResidence: string | undefined): boolean =>
  taxResidenceOf({ tax_residence: taxResidence }) === DEFAULT_TAX_RESIDENCE;

/** Why a transfer between two different assets cannot defer tax, or `undefined` when it can. */
export const transferBlock = (
  from: TransferEnd,
  to: TransferEnd,
  taxResidence: string | undefined,
): TransferBlock | undefined => {
  const ends = [
    ["from", from],
    ["to", to],
  ] as const;
  for (const [role, end] of ends) {
    if (!end.transferable) {
      return {
        code: "not_transferable",
        message: `asset ${end.asset_id} is not transferable`,
        details: { asset_id: end.asset_id, role },
      };
    }
  }
  for (const [role, end] of ends) {
    if (!allowsDeferral(end.asset_type)) {
      return {
        code: "transfer_not_between_funds",
        message: `asset ${end.asset_id} (${end.asset_type}) is not a fund: a transfer defers tax only between funds (art. 94.1.a LIRPF); record a sell and a buy instead`,
        details: { asset_id: end.asset_id, asset_type: end.asset_type, role },
      };
    }
  }
  if (!isSpanish(taxResidence)) {
    return {
      code: "transfer_not_resident",
      message: `tax_residence is ${taxResidence}: the transfer deferral only exists for Spanish tax residents`,
      details: { tax_residence: taxResidence },
    };
  }
  return undefined;
};

/** The `tax_residence` in force when the event was recorded. */
export const residenceAt = (state: LedgerState, recordedAt: IsoInstant): string | undefined =>
  settingsAt(state, madridDateOf(recordedAt)).settings.tax_residence;

/**
 * Applies the rule while replaying: the asset's flag fails, the rule of the law
 * warns. A transfer that completes a request does not repeat a warning the
 * request already raised (`requestId`), same code and same reason.
 */
export const enforceTransfer = (
  state: LedgerState,
  eventId: string,
  from: TransferEnd,
  to: TransferEnd,
  recordedAt: IsoInstant,
  requestId?: string,
): void => {
  const block = transferBlock(from, to, residenceAt(state, recordedAt));
  if (block === undefined) {
    return;
  }
  const details = { from_asset_id: from.asset_id, to_asset_id: to.asset_id, ...block.details };
  if (block.code === "not_transferable") {
    throw new ProjectionError(block.code, eventId, block.message, details);
  }
  // The message names the asset, the role or the residence: same text, same reason.
  const repeated = state.warnings.some(
    (warning) =>
      warning.event_id === requestId &&
      warning.code === block.code &&
      warning.message === block.message,
  );
  if (!repeated) {
    addWarning(state, block.code, eventId, block.message, details);
  }
};
