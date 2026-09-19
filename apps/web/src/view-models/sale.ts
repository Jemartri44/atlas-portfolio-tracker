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

/** What a result is, in words as well as by its sign: the detail and the preview say it alike. */
export const resultWord = (result: Money): string =>
  result.isNegative() ? "Pérdida" : result.isZero() ? "Resultado" : "Ganancia";

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
  /**
   * Only with more than one line: the sum of their results, each one rounded
   * once per operation, as they are declared. Amounts and costs are **not**
   * added up across operations: rounded one by one they do not subtract to the
   * total (717,35 − 724,87 = −7,52 against −7,51), and a screen that does not
   * add up to the eye sows distrust (third pass of the review of 2026-09-19).
   */
  total?: Money;
  /** A single sale whose rounded result is a cent off its amount minus its cost, as shown. */
  rounded: boolean;
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
  const [only] = lines;
  if (lines.length === 1 && only !== undefined) {
    const shown = only.proceeds.roundToCents().sub(only.cost.roundToCents());
    return { lines, rounded: !shown.eq(only.result) };
  }
  return {
    lines,
    total: Money.sumShown(
      lines.map((line) => line.result),
      EUR,
    ),
    rounded: true,
  };
};
