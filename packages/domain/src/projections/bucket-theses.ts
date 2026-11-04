// The theses of the bucket against the index (business rule 16): the part of
// the bucket that only the Cubo reads. It lives apart from `bucket.ts` because
// the net worth needs the bucket's positions and rides on the boot path of the
// web, while this module and its callers are opened on demand
// (`@atlas/domain/portfolio`).

import type { CivilDate } from "../dates/civil-date.js";
import type { Decimal } from "../money/decimal.js";
import { EUR, Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import type { AccountId, AssetId } from "../schema/events.js";
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

/** Rule 16 for one thing measured: a thesis, or the operations no thesis covers. */
export interface IndexComparison {
  /** Latent gain of the live position of the pair (account, asset); zero when there is none. */
  unrealized_eur?: Money;
  benchmark_asset_id?: AssetId;
  /** `Σ cost_i × P(d_fin) / P(d_i)`: what the same money would be worth in the index. */
  benchmark_equivalent_eur?: Money;
  /** `(result + latent) − (equivalent − invested)`. Absent when anything is missing. */
  result_vs_index_eur?: Money;
  missing_benchmark: BenchmarkGap[];
}

export interface BucketThesisView extends ThesisView, IndexComparison {}

/**
 * What a bucket (account, asset) pair bought and sold with no thesis (the
 * thesis is optional). Measured against the index like a thesis, so the main
 * metric of the bucket exists without any; it is **not** a thesis and stays out
 * of every thesis statistic (closed, hit rate, averages).
 */
export interface UntaggedView extends IndexComparison {
  account_id: AccountId;
  asset_id: AssetId;
  /** Closed when nothing of its own is held any more and it sold something. */
  status: "open" | "closed";
  buys: ThesisLeg[];
  sells: ThesisLeg[];
  invested_eur: Money;
  fees_eur: Money;
  result_eur: Money;
}

/** What the comparison with the index needs of a thesis or of an untagged pair. */
interface Measured {
  asset_id: AssetId;
  status: "open" | "closed";
  closed_at?: CivilDate;
  buys: ThesisLeg[];
  sells: ThesisLeg[];
  invested_eur: Money;
  result_eur: Money;
  /** Where a pair with no thesis stopped holding anything; a thesis ends on its closing or last sale. */
  ended_at?: CivilDate;
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
  thesis: Measured,
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
      ? (thesis.ended_at ?? lastFiscalDateOf(thesis.sells) ?? (thesis.closed_at as CivilDate))
      : date;
  const endPrice = priceAt(state, benchmarkId, end, settings, external);
  if (endPrice?.unit_value_eur === undefined) {
    gaps.push({ reason: "no_price", asset_id: benchmarkId, date: end });
    return undefined;
  }
  let equivalent = Money.zero(EUR);
  for (const leg of thesis.buys) {
    const price = priceAt(state, benchmarkId, leg.fiscal_date, settings, external);
    if (price?.unit_value_eur === undefined) {
      gaps.push({ reason: "no_price", asset_id: benchmarkId, date: leg.fiscal_date });
      return undefined;
    }
    // The units of the index the same euros bought, valued at the end, with
    // one division, as `positionValueOf` does: never through unit values in
    // euros rounded first, whose ratio loses cents when the price is tiny.
    const numerator = leg.amount_eur.amount.mul(price.fx_rate as Decimal).mul(endPrice.unit_value);
    const denominator = price.unit_value.mul(endPrice.fx_rate as Decimal);
    equivalent = equivalent.add(Money.of(numerator.div(denominator), EUR));
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
  thesis: Measured,
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
  thesis: Measured,
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
  /** The part of the bucket no thesis covers, by (account, asset); empty when every operation has one. */
  untagged: UntaggedView[];
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
const benchmarkWarningsOf = (rows: readonly IndexComparison[]): Warning[] => {
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
 * The last day something of this pair's own was taken out of its lots, whoever
 * sold it: a pair with no thesis has nobody to close it, so what it holds says
 * when it ended. Absent when nothing was bought here.
 */
const endedAtOf = (
  state: LedgerState,
  legs: { buys: ThesisLeg[]; sells: ThesisLeg[]; asset_id: AssetId },
  lots: Map<string, FiscalLot>,
): { ended_at: CivilDate } => {
  const own = new Set(legs.buys.map((leg) => leg.event_id));
  const days: string[] = [...legs.buys, ...legs.sells].map((leg) => leg.fiscal_date);
  for (const lot of lots.values()) {
    if (lot.asset_id === legs.asset_id && own.has(rootEventOf(lots, lot))) {
      // Every consumption is an operation the projection applied: it has its date.
      for (const consumption of lot.consumptions) {
        days.push((state.eventFacts.get(consumption.event_id) as { date: CivilDate }).date);
      }
    }
  }
  return { ended_at: days.sort().at(-1) as CivilDate };
};

/** The comparison with the index (rule 16) of one thing measured. */
const compareWithIndex = (
  state: LedgerState,
  measured: Measured,
  date: CivilDate,
  settings: Settings,
  lots: Map<string, FiscalLot>,
  external?: ExternalPrices,
  /** Pairs with no thesis only: what a thesis sold of another's lots stays "no data", as it always was. */
  soldOnly = false,
): IndexComparison => {
  const benchmarkId = settings.bucket_benchmark_asset_id;
  const gaps: BenchmarkGap[] = [];
  const latent = latentOf(state, measured, date, settings, gaps, lots, external);
  let equivalent: Money | undefined;
  if (benchmarkId === undefined) {
    gaps.push({ reason: "no_benchmark" });
  } else if (!state.assets.has(benchmarkId)) {
    gaps.push({ reason: "unknown_asset", asset_id: benchmarkId });
  } else if (soldOnly && measured.buys.length === 0 && measured.sells.length > 0) {
    // What was sold here was bought under another thesis, or under none, which
    // carries the money put in: this one brings its realised gain and nothing
    // to compare it with.
    equivalent = Money.zero(EUR);
  } else if (measured.buys.length === 0) {
    // Nothing was ever put in: the index would have made nothing out of
    // nothing, and that is "no data", not zero.
    gaps.push({ reason: "no_linked_buys" });
  } else {
    equivalent = benchmarkEquivalentOf(
      state,
      measured,
      benchmarkId,
      date,
      settings,
      gaps,
      external,
    );
  }
  const comparable = equivalent !== undefined && latent !== undefined;
  return {
    ...(latent === undefined ? {} : { unrealized_eur: latent }),
    ...(benchmarkId === undefined ? {} : { benchmark_asset_id: benchmarkId }),
    ...(equivalent === undefined ? {} : { benchmark_equivalent_eur: equivalent }),
    ...(comparable
      ? {
          result_vs_index_eur: measured.result_eur
            .add(latent as Money)
            .sub((equivalent as Money).sub(measured.invested_eur)),
        }
      : {}),
    missing_benchmark: gaps,
  };
};

/**
 * The theses with their result against the index, and the pairs bought with no
 * thesis. It **wraps** `theses()` instead of extending it: pass B of the
 * projection uses `theses.ts`, and the path that creates lots and gains must
 * never learn what a price is (constitution II, enforced by the architecture
 * test).
 */
export const bucketTheses = (
  state: LedgerState,
  date: CivilDate,
  settings: Settings,
  external?: ExternalPrices,
): BucketThesesView => {
  const lots = lotIndexOf(state);
  const rows = theses(state, date).map((thesis) => ({
    ...thesis,
    ...compareWithIndex(state, thesis, date, settings, lots, external),
  }));
  const untagged = [...state.unlinked.values()].map((legs): UntaggedView => {
    const held = ownQuantityOf(state, { ...legs, status: "open" }, lots).isPositive();
    const closed = !held;
    const measured: Measured = {
      ...legs,
      status: closed ? "closed" : "open",
      ...(closed ? endedAtOf(state, legs, lots) : {}),
    };
    return {
      ...legs,
      status: measured.status,
      ...compareWithIndex(state, measured, date, settings, lots, external, true),
    };
  });
  return { rows, untagged, warnings: benchmarkWarningsOf([...rows, ...untagged]) };
};
