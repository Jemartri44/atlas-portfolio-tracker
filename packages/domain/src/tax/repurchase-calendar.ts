// Until when not to buy an asset back (criteria #2, #14, #18).
//
// A loss is not computed while homogeneous securities are acquired within the
// window around the sale (art. 33.5.f and g LIRPF; e for crypto, only after);
// the engine already marks each loss whose window after the sale is still
// open on the day of the query (`provisional_until`). This list turns those
// lines into the question the user asks before buying: "until when must I not
// buy X, and how much loss is at stake?". The answer is the engine's own
// lines, never a second computation: a calendar that disagreed with the tax
// report would be worse than none.
//
// What would block the loss is a purchase of the same asset (ADR-0009: an ISIN
// is one asset, whatever account or market) or a transfer in when
// `wash_sale_transfer_counts` says so (#2b); bonus shares (`scale`) and a grant
// at zero cost do not, and a different fund that tracks the same index is not
// homogeneous (DGT V2234-25). The exception of the single purchase (#18) looks
// only at the window **before** the sale, so it never frees a purchase made
// now. A sale whose loss a repurchase already deferred in full is not listed:
// buying more defers nothing more. Exchange differences of currency (#4) have
// a window of their own and no asset, and are not here.

import type { CivilDate } from "../dates/civil-date.js";
import { yearOf } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { Money } from "../money/money.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { AssetId, LedgerEvent } from "../schema/events.js";
import { ASSET_TYPES } from "../schema/events.js";
import { washSaleTransferCounts, washSaleWindowOf } from "../settings/wash-sale.js";
import { FIRST_SUPPORTED_YEAR } from "./chain.js";
import type { TaxYearReport } from "./report.js";
import { taxYear } from "./year.js";

export interface BlockingSale {
  event_id: Ulid;
  fiscal_date: CivilDate;
  /** Last day on which a purchase still defers this loss (included, #14). */
  until: CivilDate;
  /** Loss still computable today: what a repurchase before `until` would defer. Positive. */
  at_stake_eur: Money;
  /** Loss a repurchase already deferred. Positive. */
  deferred_eur: Money;
}

export interface RepurchaseBlock {
  asset_id: AssetId;
  /** The latest `until` of its sales: buying after it defers nothing. */
  until: CivilDate;
  at_stake_eur: Money;
  sales: BlockingSale[];
}

export interface RepurchaseCalendar {
  today: CivilDate;
  /** A transfer in counts as a purchase too (#2b). */
  transfer_in_counts: boolean;
  /** Sorted by `until`, earliest first. */
  blocks: RepurchaseBlock[];
}

const zero = Money.zero("EUR");
const positive = (money: Money): Money => (money.isNegative() ? money.neg() : zero);

/**
 * Every asset whose sale at a loss still has its window open on `today`. The
 * engine is read for every year whose sales could still be open: one year back
 * for the legal windows, more only for a custom window in days that is longer.
 */
export const repurchaseCalendar = (
  events: readonly LedgerEvent[],
  today: CivilDate,
): RepurchaseCalendar => {
  const year = yearOf(today);
  const settings = projectLedger(events, { collectErrors: true, asOf: today }).fiscalSettings;
  const longest = Math.max(
    ...ASSET_TYPES.map((type) => {
      const window = washSaleWindowOf(settings, type);
      return window.endsWith("d") ? Math.ceil(Number(window.slice(0, -1)) / 365) : 1;
    }),
  );
  const reports: TaxYearReport[] = [];
  for (let y = year; y >= Math.max(FIRST_SUPPORTED_YEAR, year - longest); y--) {
    reports.push(taxYear(events, y, { today }));
  }
  const byAsset = new Map<AssetId, BlockingSale[]>();
  for (const report of reports) {
    for (const line of [...report.capital_gains.lines, ...report.movable_capital.transmissions]) {
      // What the rule looks at —the own loss, never a gain, plus what the sale
      // released (#21)— minus what a repurchase already deferred.
      const ownLoss = line.own_eur.isNegative() ? line.own_eur : zero;
      const atStake = positive(ownLoss.add(line.released_eur).sub(line.deferred_eur));
      if (line.provisional_until === undefined || atStake.isZero()) {
        continue;
      }
      const sale: BlockingSale = {
        event_id: line.event_id,
        fiscal_date: line.fiscal_date,
        until: line.provisional_until,
        at_stake_eur: atStake,
        deferred_eur: positive(line.deferred_eur),
      };
      byAsset.set(line.asset_id, [...(byAsset.get(line.asset_id) ?? []), sale]);
    }
  }
  const blocks = [...byAsset.entries()].map(([asset_id, sales]) => ({
    asset_id,
    until: sales
      .map((sale) => sale.until)
      .sort()
      .at(-1) as CivilDate,
    at_stake_eur: sales.reduce((sum, sale) => sum.add(sale.at_stake_eur), zero),
    sales: sales.sort((a, b) => a.until.localeCompare(b.until)),
  }));
  return {
    today,
    transfer_in_counts: washSaleTransferCounts(settings),
    blocks: blocks.sort(
      (a, b) => a.until.localeCompare(b.until) || a.asset_id.localeCompare(b.asset_id),
    ),
  };
};
