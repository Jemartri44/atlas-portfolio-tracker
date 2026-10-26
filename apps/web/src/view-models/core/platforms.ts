// The purchases of a plan grouped by platform, as rows (feature 028).
//
// The grouping, the cash that is already there and the commissions are the
// domain's (`platformPlan`); this only adds the names and the sentence that
// says where each commission comes from.

import type { Money } from "@atlas/domain";
import type { FeeEstimate, PlatformPlan } from "@atlas/domain/portfolio";
import { formatDate } from "../../format/date.js";
import { displayName, type NameIndex, NO_NAMES } from "../../format/names.js";

export interface PlatformLineView {
  assetId: string;
  name: string;
  amount: Money;
  /** Absent: the ledger has no equivalent trade, so the commission is unknown (never zero). */
  fee?: Money;
  feePct?: string;
  /** Where the commission was read from, in the owner's words. */
  feeNote?: string;
}

export interface PlatformRowView {
  accountId: string;
  platform: string;
  buy: Money;
  /** In euros; absent for an account kept in another currency. */
  cash?: Money;
  cashNegative: boolean;
  foreignCurrency: boolean;
  fees: Money;
  deposit: Money;
  lines: PlatformLineView[];
  unknownFees: string[];
  /** The asset whose commission weighs most over its amount, when any weighs. */
  costliest?: string;
}

export interface UnassignedView {
  assetId: string;
  name: string;
  amount: Money;
  /** Names of the accounts the owner can choose from. */
  candidates: string[];
}

export interface PlatformsView {
  rows: PlatformRowView[];
  unassigned: UnassignedView[];
}

const noteOf = (fee: FeeEstimate): string =>
  `${fee.basis === "same_asset" ? "como tu última operación de este activo" : "como tu última operación de este tipo de activo"}, ${formatDate(fee.as_of)}`;

export const platformsView = (plan: PlatformPlan, names: NameIndex = NO_NAMES): PlatformsView => ({
  rows: plan.rows.map((row) => ({
    accountId: row.account_id,
    platform: row.platform,
    buy: row.buy_eur,
    ...(row.cash_eur === undefined ? {} : { cash: row.cash_eur }),
    cashNegative: row.cash_negative,
    foreignCurrency: row.foreign_currency,
    fees: row.fees_eur,
    deposit: row.deposit_eur,
    unknownFees: row.unknown_fee_assets.map((id) => displayName(names, id)),
    ...(row.costliest_asset_id === undefined
      ? {}
      : { costliest: displayName(names, row.costliest_asset_id) }),
    lines: row.lines.map((line) => ({
      assetId: line.asset_id,
      name: displayName(names, line.asset_id),
      amount: line.amount_eur,
      ...(line.fee === undefined ? {} : { fee: line.fee.fee_eur, feeNote: noteOf(line.fee) }),
      ...(line.fee_pct === undefined ? {} : { feePct: line.fee_pct.toString() }),
    })),
  })),
  unassigned: plan.unassigned.map((order) => ({
    assetId: order.asset_id,
    name: displayName(names, order.asset_id),
    amount: order.amount_eur,
    candidates: order.candidates,
  })),
});
