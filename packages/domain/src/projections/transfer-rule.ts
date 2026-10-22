// The deferral of a transfer exists only between investment funds (article
// 94.1.a LIRPF, business-rules.md §5.2) and only for a Spanish tax resident
// (§5.9). The free `transferable` flag alone never grants it.

import { madridDateOf } from "../dates/madrid.js";
import type { IsoInstant } from "../schema/envelope.js";
import type { AssetType } from "../schema/events.js";
import { settingsAt } from "./settings-at.js";
import type { LedgerState } from "./state.js";

const DEFERRAL_TYPES: readonly AssetType[] = ["fund", "money_market"];

export const allowsDeferral = (assetType: AssetType): boolean => DEFERRAL_TYPES.includes(assetType);

export interface TransferBlock {
  code: "not_transferable" | "transfer_not_resident";
  message: string;
  details: Record<string, unknown>;
}

interface TransferEnd {
  asset_id: string;
  asset_type: AssetType;
  transferable: boolean;
}

/** Why a transfer between two different assets cannot defer tax, or `undefined` when it can. */
export const transferBlock = (
  from: TransferEnd,
  to: TransferEnd,
  taxResidence: string | undefined,
): TransferBlock | undefined => {
  if ((taxResidence ?? "ES") !== "ES") {
    return {
      code: "transfer_not_resident",
      message: `tax_residence is ${taxResidence}: the transfer deferral only exists for Spanish tax residents`,
      details: { tax_residence: taxResidence },
    };
  }
  for (const [role, end] of [
    ["from", from],
    ["to", to],
  ] as const) {
    if (!end.transferable || !allowsDeferral(end.asset_type)) {
      return {
        code: "not_transferable",
        message: `asset ${end.asset_id} (${end.asset_type}) cannot be transferred: the deferral only applies between funds and money-market funds (art. 94.1.a LIRPF); record a sell and a buy instead`,
        details: { asset_id: end.asset_id, asset_type: end.asset_type, role },
      };
    }
  }
  return undefined;
};

/** The `tax_residence` in force when the event was recorded. */
export const residenceAt = (state: LedgerState, recordedAt: IsoInstant): string | undefined =>
  settingsAt(state, madridDateOf(recordedAt)).settings.tax_residence;
