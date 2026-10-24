// The theses of the bucket against the index (business rule 16): the part of
// the bucket that only the Cubo reads. It lives apart from `bucket.ts` because
// the net worth needs the bucket's positions and rides on the boot path of the
// web, while this module and its callers are opened on demand
// (`@atlas/domain/portfolio`).

import type { CivilDate } from "../dates/civil-date.js";
import { EUR, Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import type { AssetId } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { lotIndexOf, openUnitCostOf, rootEventOf, warn } from "./bucket.js";
import { type ExternalPrices, positionValueOf, priceAt } from "./prices.js";
import type { FiscalLot, LedgerState, ThesisLeg, ThesisView, Warning } from "./state.js";
import { theses } from "./theses.js";

/** Why a thesis has no comparison with the index. Never a zero in its place. */
export interface BenchmarkGap {
  reason: "no_benchmark" | "unknown_asset" | "no_price" | "no_linked_buys" | "no_asset_price";
  asset_id?: AssetId;
  date?: CivilDate;
}

export interface BucketThesisView extends ThesisView {
  /** Latent gain of the live position of the pair (account, asset); zero when there is none. */
  unrealized_eur?: Money;
  benchmark_asset_id?: AssetId;
  /** `Σ cost_i × P(d_fin) / P(d_i)`: what the same money would be worth in the index. */
  benchmark_equivalent_eur?: Money;
  /** `(result + latent) − (equivalent − invested)`. Absent when anything is missing. */
  result_vs_index_eur?: Money;
  missing_benchmark: BenchmarkGap[];
}

/** The greatest fiscal date among the legs, or nothing when there are none. */
const lastFiscalDateOf = (legs: readonly ThesisLeg[]): CivilDate | undefined => {
  let last: CivilDate | undefined;
  for (const leg of legs) {
    if (last === undefined || leg.fiscal_date > last) {
      last = leg.fiscal_date;
    }
  }
  return last;
};

/**
 * What the same money, on the same dates, would have made in the index
 * (business rule 16):
 *
 *     benchmark_equivalent_eur = Σ cost_i × P(d_fin) / P(d_i)
 *
 * `P` is the price of the benchmark on `d` **in euros** (the user would
 * have put euros in the index, so the comparable return is theirs, currency
 * effect included), and `d_fin` is the fiscal date of the last linked sale of a
 * closed thesis, or the date asked while it is open.
 *
 * If any `P` is missing the whole comparison is missing: a partial sum would
 * be a number nobody can reproduce (constitution V).
 */
const benchmarkEquivalentOf = (
  state: LedgerState,
  thesis: ThesisView,
  benchmarkId: AssetId,
  date: CivilDate,
  settings: Settings,
  gaps: BenchmarkGap[],
  external?: ExternalPrices,
): Money | undefined => {
  // A finished bet is measured to the day it finished, never to today: an open
  // thesis moves with the market, a closed one does not get to change sign
  // depending on the day it is looked at. "Last sale" is the one with the
  // greatest **fiscal** date, not the last of the array: the legs pile up in
  // file order, which is not the fiscal order when the rule is `value_date` or
  // when a later rectification arrives. A thesis closed with no sale at all —
  // its asset was swapped — ends on the day it was closed.
  const end =
    thesis.status === "closed"
      ? (lastFiscalDateOf(thesis.sells) ?? (thesis.closed_at as CivilDate))
      : date;
  const endPrice = priceAt(state, benchmarkId, end, settings, external);
  const endEur = endPrice?.unit_value_eur;
  if (endEur === undefined) {
    gaps.push({ reason: "no_price", asset_id: benchmarkId, date: end });
    return undefined;
  }
  let equivalent = Money.zero(EUR);
  for (const leg of thesis.buys) {
    const price = priceAt(state, benchmarkId, leg.fiscal_date, settings, external);
    const eur = price?.unit_value_eur;
    if (eur === undefined) {
      gaps.push({ reason: "no_price", asset_id: benchmarkId, date: leg.fiscal_date });
      return undefined;
    }
    equivalent = equivalent.add(leg.amount_eur.mul(endEur.amount.div(eur.amount)));
  }
  return equivalent;
};

/**
 * What of its own asset a thesis still holds, by **lineage**: the open lots
 * whose root — following `source_lot_id` up to the origin — is one of its own
 * purchases.
 *
 * "Bought minus sold" is not the same thing and silently loses shares: a split
 * multiplies a lot without any new purchase, so six shares bought and split two
 * for one are twelve shares of the thesis that `quantity_bought` never saw. The
 * lineage also keeps out what is not its own — the shares the next thesis on
 * the asset bought, and the ones a swap moved to another asset, which leave no
 * open lot of this one behind.
 */
const ownQuantityOf = (
  state: LedgerState,
  thesis: ThesisView,
  lots: Map<string, FiscalLot>,
): Quantity => {
  const own = new Set(thesis.buys.map((leg) => leg.event_id));
  let quantity = Quantity.ZERO;
  for (const lot of state.lots.get(thesis.asset_id)?.open ?? []) {
    if (own.has(rootEventOf(lots, lot))) {
      quantity = quantity.add(lot.quantity);
    }
  }
  return quantity;
};

/**
 * Latent gain of what **this thesis** still holds (`ownQuantityOf`), not of the
 * position of the pair (account, asset). A thesis closed while the pair still
 * holds something — because the next thesis on the asset bought more — must not
 * count shares that are not its own; that is the same mixing the statistics
 * exclude.
 */
const latentOf = (
  state: LedgerState,
  thesis: ThesisView,
  date: CivilDate,
  settings: Settings,
  gaps: BenchmarkGap[],
  lots: Map<string, FiscalLot>,
  external?: ExternalPrices,
): Money | undefined => {
  const own = ownQuantityOf(state, thesis, lots);
  if (!own.isPositive()) {
    return Money.zero(EUR);
  }
  const price = priceAt(state, thesis.asset_id, date, settings, external);
  const unitCost = openUnitCostOf(state, thesis.asset_id);
  const value = positionValueOf(price, own);
  if (value === undefined || unitCost === undefined) {
    gaps.push({ reason: "no_asset_price", asset_id: thesis.asset_id, date });
    return undefined;
  }
  return value.sub(unitCost.mul(own.value));
};

export interface BucketThesesView {
  rows: BucketThesisView[];
  /** What keeps the comparison with the index from existing, said once per cause. */
  warnings: Warning[];
}

/**
 * The gaps of the index, turned into warnings the views cannot forget to show.
 * A gap lives inside each thesis, which is the right place to read it one by
 * one, and the wrong place to notice it: three theses without an index printed
 * the same as three theses beating it. Said once per cause, not per thesis.
 *
 * `no_linked_buys` and `no_asset_price` are facts of the thesis, not gaps of
 * the benchmark: the first means nothing was ever put in, and the second is
 * already the `partial_bucket_total` of its own asset.
 */
const benchmarkWarningsOf = (rows: readonly BucketThesisView[]): Warning[] => {
  const warnings: Warning[] = [];
  const said = new Set<string>();
  const once = (
    key: string,
    code: string,
    message: string,
    details: Record<string, unknown>,
  ): void => {
    if (!said.has(key)) {
      said.add(key);
      warn(warnings, code, message, details);
    }
  };
  for (const thesis of rows) {
    for (const gap of thesis.missing_benchmark) {
      switch (gap.reason) {
        case "no_benchmark":
          once(
            "no_benchmark",
            "missing_benchmark_asset",
            "no benchmark asset configured: rule 16 has nothing to compare against",
            {},
          );
          break;
        case "unknown_asset":
          once(
            `unknown|${gap.asset_id}`,
            "unknown_benchmark_asset",
            `the benchmark ${gap.asset_id} is not in the catalogue`,
            {
              asset_id: gap.asset_id,
            },
          );
          break;
        case "no_price":
          once(
            `price|${gap.asset_id}|${gap.date}`,
            "missing_benchmark_price",
            `no price for the benchmark ${gap.asset_id} at ${gap.date}`,
            { asset_id: gap.asset_id, date: gap.date },
          );
          break;
        default:
          break;
      }
    }
  }
  return warnings;
};

/**
 * The theses with their result against the index. It **wraps** `theses()`
 * instead of extending it: pass B of the projection uses `theses.ts`, and the
 * path that creates lots and gains must never learn what a price is
 * (constitution II, enforced by the architecture test).
 */
export const bucketTheses = (
  state: LedgerState,
  date: CivilDate,
  settings: Settings,
  external?: ExternalPrices,
): BucketThesesView => {
  const benchmarkId = settings.bucket_benchmark_asset_id;
  const lots = lotIndexOf(state);
  const rows = theses(state, date).map((thesis) => {
    const gaps: BenchmarkGap[] = [];
    const latent = latentOf(state, thesis, date, settings, gaps, lots, external);
    let equivalent: Money | undefined;
    if (benchmarkId === undefined) {
      gaps.push({ reason: "no_benchmark" });
    } else if (!state.assets.has(benchmarkId)) {
      gaps.push({ reason: "unknown_asset", asset_id: benchmarkId });
    } else if (thesis.buys.length === 0) {
      // Nothing was ever put in: the index would have made nothing out of
      // nothing, and that is "no data", not zero.
      gaps.push({ reason: "no_linked_buys" });
    } else {
      equivalent = benchmarkEquivalentOf(
        state,
        thesis,
        benchmarkId,
        date,
        settings,
        gaps,
        external,
      );
    }
    const comparable = equivalent !== undefined && latent !== undefined;
    return {
      ...thesis,
      ...(latent === undefined ? {} : { unrealized_eur: latent }),
      ...(benchmarkId === undefined ? {} : { benchmark_asset_id: benchmarkId }),
      ...(equivalent === undefined ? {} : { benchmark_equivalent_eur: equivalent }),
      ...(comparable
        ? {
            result_vs_index_eur: thesis.result_eur
              .add(latent as Money)
              .sub((equivalent as Money).sub(thesis.invested_eur)),
          }
        : {}),
      missing_benchmark: gaps,
    };
  });
  return { rows, warnings: benchmarkWarningsOf(rows) };
};
