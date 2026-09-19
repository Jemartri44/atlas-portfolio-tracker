// What a movement sold, from the gains the ledger booked for it.
//
// A sale books one gain; a corporate action can book several — the reverse
// split of Physical Gold ETC sells fractions in two accounts, one gain each.
// Showing the first one alone put an incomplete fiscal figure on screen as if
// it were the whole (second pass of the review of 2026-09-19). So every gain
// of the event is a line, and the total is the sum of the lines **as shown**
// (`Money.sumShown`), the one a reader gets adding up the column.

import { EUR, Money, type RealizedGain } from "@atlas/domain";
import { displayName, type NameIndex } from "../format/names.js";

export interface SaleLine {
  /** Where it was sold: the account, and the asset when the event touched several. */
  where: string;
  proceeds: Money;
  cost: Money;
  /** Rounded once per operation, as the ledger booked it. */
  result: Money;
}

export interface SaleResultView {
  lines: SaleLine[];
  /** Only with more than one line: a single sale is its own total. */
  total?: { proceeds: Money; cost: Money; result: Money };
}

export const saleResult = (
  gains: readonly RealizedGain[],
  eventId: string,
  names: NameIndex,
): SaleResultView | undefined => {
  const booked = gains.filter((gain) => gain.event_id === eventId);
  if (booked.length === 0) {
    return undefined;
  }
  const assets = new Set(booked.map((gain) => gain.asset_id));
  const lines = booked.map((gain) => ({
    where:
      assets.size > 1
        ? `${displayName(names, gain.asset_id)} · ${displayName(names, gain.account_id)}`
        : displayName(names, gain.account_id),
    proceeds: gain.proceeds_eur,
    cost: gain.cost_eur,
    result: gain.gain_eur_rounded,
  }));
  if (lines.length === 1) {
    return { lines };
  }
  const sum = (pick: (line: SaleLine) => Money): Money => Money.sumShown(lines.map(pick), EUR);
  return {
    lines,
    total: {
      proceeds: sum((line) => line.proceeds),
      cost: sum((line) => line.cost),
      result: sum((line) => line.result),
    },
  };
};
