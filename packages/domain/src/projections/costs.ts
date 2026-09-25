// What the portfolio costs (specification §6.1, business rules 6 and 14):
// commissions paid per asset, TER and the estimated yearly cost.
//
// The two books are returned side by side and never added together: the core
// per asset, the bucket only as a total per account (constitution III; the full
// bucket metric of rule 14 arrives with phase 3).

import type { CivilDate } from "../dates/civil-date.js";
import { Decimal } from "../money/decimal.js";
import { FxRate } from "../money/fx-rate.js";
import { Money } from "../money/money.js";
import { Price } from "../money/price.js";
import { Quantity } from "../money/quantity.js";
import type {
  AccountId,
  AssetClass,
  AssetId,
  Book,
  BuyEvent,
  CorporateActionEvent,
  LedgerEvent,
  SellEvent,
  StandaloneFeeEvent,
} from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { type ExternalPrices, manualPrices, positionValueOf } from "./prices.js";
import { businessDateOf, isOperationEvent } from "./project-ledger.js";
import type { LedgerState } from "./state.js";
import { coreAccountIds, coreQuantityOf } from "./weights.js";

const HUNDRED = Decimal.parse("100");
const EUR = "EUR";

export interface CoreCostRow {
  asset_id: AssetId;
  asset_class: AssetClass;
  /** Σ `fee / fx_rate` of its buys, sells and forced sales. */
  fees_eur: Money;
  /** Σ acquisition cost of its buys, fee included. */
  invested_eur: Money;
  /** `fees / invested × 100`; absent when nothing was ever bought. */
  fees_pct?: Decimal;
  ter?: Decimal;
  value_eur?: Money;
  /** `ter/100 × value`; only with a price. */
  annual_cost_eur?: Money;
}

export interface CoreCostTotals {
  fees_eur: Money;
  invested_eur: Money;
  /** Value of the part that does have a price. */
  value_eur: Money;
  /** Weighted by value over the priced part. */
  weighted_ter?: Decimal;
  annual_cost_eur?: Money;
  /** Some core asset held has no price: the aggregate covers only part of the core. */
  partial: boolean;
}

export interface BucketCostRow {
  account_id: AccountId;
  fees_eur: Money;
  /** Σ acquisition cost of its buys, fee included: the capital actually traded (rule 14). */
  invested_eur: Money;
}

export interface BucketCostTotals {
  fees_eur: Money;
  invested_eur: Money;
  /** `fees / invested × 100`; absent when nothing was ever bought. */
  fees_pct?: Decimal;
}

export interface StandaloneFeeRow {
  account_id: AccountId;
  book: Book;
  fees_eur: Money;
}

/**
 * Fees that are **not** inherent to an acquisition or a transmission — custody,
 * administration, connectivity — and therefore do **not** add to the
 * acquisition cost nor subtract from the transmission value (art. 35 LIRPF,
 * `docs/business-rules.md` §5.2). They live in `standalone_fee`, they are real
 * money leaving the account, and until now no view of either interface showed
 * them at all.
 *
 * They are **not classified by kind** here. The field that tells custody from
 * connectivity (`fee_kind`) exists since ADR-0021, but classifying is what the
 * tax engine of phase 5 does with it —article 26.1.a) LIRPF admits custody and
 * administration against movable capital income and not the rest— and until
 * that engine exists, a breakdown here would be a number with no consequence.
 *
 * The two books keep their own total: they never share one (constitution III).
 */
export interface StandaloneFees {
  rows: StandaloneFeeRow[];
  core_eur: Money;
  bucket_eur: Money;
}

export interface CostSummary {
  date: CivilDate;
  core: { rows: CoreCostRow[]; totals: CoreCostTotals };
  bucket: { rows: BucketCostRow[]; totals: BucketCostTotals };
  /** Charges that never touch the fiscal basis; shown apart and labelled as such. */
  standalone: StandaloneFees;
}

const feeEurOf = (event: {
  fee: string;
  currency: string;
  fx_rate: string;
  fx_rate_date: CivilDate;
}): Money =>
  FxRate.of(Decimal.parse(event.fx_rate), event.currency, event.fx_rate_date).toEur(
    Money.parse(event.fee, event.currency),
  );

/**
 * A standalone fee in euros. The rate carries its own date since ADR-0021 made
 * `fx_rate_date` required here, so there is nothing to fall back to: a line
 * without it does not reach a projection, because the loader rejects it.
 */
const standaloneFeeEurOf = (event: StandaloneFeeEvent): Money =>
  FxRate.of(Decimal.parse(event.fx_rate), event.currency, event.fx_rate_date).toEur(
    Money.parse(event.amount, event.currency),
  );

/** Acquisition cost of a buy: `(amount ?? quantity × unit_price) + fee`, in euros (data-schema.md §8.1). */
const costEurOf = (event: BuyEvent): Money => {
  const basis =
    event.amount === undefined
      ? Price.parse(event.unit_price, event.currency).times(Quantity.parse(event.quantity))
      : Money.parse(event.amount, event.currency);
  return FxRate.of(Decimal.parse(event.fx_rate), event.currency, event.fx_rate_date).toEur(
    basis.add(Money.parse(event.fee, event.currency)),
  );
};

/**
 * Commissions of a corporate action: a `forced_sale` is a sale for every
 * purpose (ADR-0011) and each broker's charge is recorded per account, so it
 * counts like the fee of a `sell` (Q2, resolved).
 */
const forcedSaleFees = (
  event: CorporateActionEvent,
): { asset_id: AssetId; account_id: AccountId; fee: Money }[] => {
  const fees: { asset_id: AssetId; account_id: AccountId; fee: Money }[] = [];
  for (const effect of event.effects) {
    if (effect.op !== "forced_sale") {
      continue;
    }
    const rate = FxRate.of(Decimal.parse(effect.fx_rate), effect.currency, effect.fx_rate_date);
    for (const entry of effect.per_account) {
      if (entry.fee === undefined) {
        continue;
      }
      fees.push({
        asset_id: effect.asset_id ?? event.asset_id,
        account_id: entry.account_id,
        fee: rate.toEur(Money.parse(entry.fee, effect.currency)),
      });
    }
  }
  return fees;
};

interface BucketTotals {
  fees: Money;
  invested: Money;
}

interface Accumulator {
  fees: Map<AssetId, Money>;
  invested: Map<AssetId, Money>;
  /** Per account of the bucket: commissions paid and capital traded, together. */
  bucket: Map<AccountId, BucketTotals>;
  /** Per account, either book: the charges that are not part of any basis. */
  standalone: Map<AccountId, Money>;
}

const addTo = <K>(map: Map<K, Money>, key: K, amount: Money): void => {
  map.set(key, (map.get(key) ?? Money.zero(EUR)).add(amount));
};

/** Books a bucket trade under its account: the commission always, the cost only for a purchase. */
const addToBucket = (
  totals: Accumulator,
  accountId: AccountId,
  fee: Money,
  cost: Money | undefined,
): void => {
  const current = totals.bucket.get(accountId) ?? {
    fees: Money.zero(EUR),
    invested: Money.zero(EUR),
  };
  totals.bucket.set(accountId, {
    fees: current.fees.add(fee),
    invested: cost === undefined ? current.invested : current.invested.add(cost),
  });
};

/**
 * Books one trade under its asset (core) or its account (bucket). An account
 * the catalogue does not know has no book: in a degraded ledger its operations
 * must not fall into the core table just for not being in the bucket one
 * (constitution III: the books never mix).
 */
const bookTrade = (state: LedgerState, totals: Accumulator, event: BuyEvent | SellEvent): void => {
  const book = state.accounts.get(event.account_id)?.book;
  if (book === undefined) {
    return;
  }
  const fee = feeEurOf(event);
  if (book === "bucket") {
    addToBucket(totals, event.account_id, fee, event.type === "buy" ? costEurOf(event) : undefined);
    return;
  }
  addTo(totals.fees, event.asset_id, fee);
  if (event.type === "buy") {
    addTo(totals.invested, event.asset_id, costEurOf(event));
  }
};

const accumulate = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  asOf: CivilDate | undefined,
): Accumulator => {
  const totals: Accumulator = {
    fees: new Map(),
    invested: new Map(),
    bucket: new Map(),
    standalone: new Map(),
  };
  // An event the projection rejected produced no position and no lot: its
  // commission is not a cost of the portfolio either (ADR-0015).
  const invalid = new Set(state.invalid.map((entry) => entry.event.id));
  for (const event of events) {
    // A reversed event never happened, so neither did its commission.
    if (state.reversed.has(event.id) || invalid.has(event.id)) {
      continue;
    }
    // The same cut as pass B of the projection, from the same business date
    // (data-schema.md §7): a commission paid after the date asked is not a cost
    // of the portfolio as it stood that day.
    if (asOf !== undefined && isOperationEvent(event) && businessDateOf(state, event) > asOf) {
      continue;
    }
    if (event.type === "buy" || event.type === "sell") {
      bookTrade(state, totals, event);
      continue;
    }
    if (event.type === "standalone_fee") {
      addTo(totals.standalone, event.account_id, standaloneFeeEurOf(event));
      continue;
    }
    if (event.type === "corporate_action") {
      // Each entry names the account the broker charged, so the charge lands in
      // the right book even when the position was fully cashed out.
      for (const { asset_id, account_id, fee } of forcedSaleFees(event)) {
        const book = state.accounts.get(account_id)?.book;
        if (book === undefined) {
          continue;
        }
        if (book === "bucket") {
          addToBucket(totals, account_id, fee, undefined);
          continue;
        }
        addTo(totals.fees, asset_id, fee);
      }
    }
  }
  return totals;
};

/**
 * The bucket side: commissions and traded capital per account, and the ratio of
 * business rule 14 — "with a small account and fixed fees, the commissions
 * decide the result before the judgement does". Never a row or a total shared
 * with the core (constitution III).
 */
const bucketBlockOf = (totals: Accumulator): CostSummary["bucket"] => {
  const rows = [...totals.bucket].map(([account_id, entry]) => ({
    account_id,
    fees_eur: entry.fees,
    invested_eur: entry.invested,
  }));
  const fees = rows.reduce((sum, row) => sum.add(row.fees_eur), Money.zero(EUR));
  const invested = rows.reduce((sum, row) => sum.add(row.invested_eur), Money.zero(EUR));
  return {
    rows,
    totals: {
      fees_eur: fees,
      invested_eur: invested,
      ...(invested.isZero() ? {} : { fees_pct: fees.amount.div(invested.amount).mul(HUNDRED) }),
    },
  };
};

/**
 * The standalone charges, per account and with a total per book. An account the
 * catalogue does not know has no book, so its charge is left out rather than
 * dropped into one of the two totals (constitution III, same rule as `bookTrade`).
 */
const standaloneBlockOf = (state: LedgerState, totals: Accumulator): StandaloneFees => {
  const rows: StandaloneFeeRow[] = [];
  let core = Money.zero(EUR);
  let bucket = Money.zero(EUR);
  for (const [account_id, fees_eur] of totals.standalone) {
    const book = state.accounts.get(account_id)?.book;
    if (book === undefined) {
      continue;
    }
    rows.push({ account_id, book, fees_eur });
    if (book === "bucket") {
      bucket = bucket.add(fees_eur);
    } else {
      core = core.add(fees_eur);
    }
  }
  rows.sort((a, b) => a.account_id.localeCompare(b.account_id));
  return { rows, core_eur: core, bucket_eur: bucket };
};

const annualCostOf = (ter: Decimal | undefined, value: Money | undefined): Money | undefined =>
  ter === undefined || value === undefined ? undefined : value.mul(ter).div(HUNDRED);

export const costSummary = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  date: CivilDate,
  settings: Settings,
  /** Business-date cut, the same one the projection was given (`ProjectOptions.asOf`). */
  asOf?: CivilDate,
  external?: ExternalPrices,
): CostSummary => {
  const totals = accumulate(state, events, asOf);
  const prices = manualPrices(state, date, settings, external);
  const rows: CoreCostRow[] = [];
  let partial = false;
  let valued = Money.zero(EUR);
  let annual = Money.zero(EUR);
  let weightedTer = Decimal.ZERO;

  const core = coreAccountIds(state);
  for (const [assetId, asset] of state.assets) {
    if (asset.book !== "core") {
      continue;
    }
    const quantity = coreQuantityOf(state, assetId, core);
    const fees = totals.fees.get(assetId);
    // An asset that never traded and is not held has no cost to report. One
    // that arrived by transfer or conversion has no commission of its own but
    // does carry a TER, so it must weigh in the aggregate.
    if (fees === undefined && !quantity.isPositive()) {
      continue;
    }
    const feesEur = fees ?? Money.zero(EUR);
    // Absent when the position arrived by transfer or conversion instead of a purchase.
    const invested = totals.invested.get(assetId) ?? Money.zero(EUR);
    const price = prices.get(assetId);
    const value = positionValueOf(price, quantity);
    // Without a price, or with a quote that has no value in euros (feature 013).
    if (quantity.isPositive() && value === undefined) {
      partial = true;
    }
    const ter = asset.ter === undefined ? undefined : Decimal.parse(asset.ter);
    const annualCost = annualCostOf(ter, value);
    if (value !== undefined) {
      valued = valued.add(value);
      if (ter !== undefined) {
        weightedTer = weightedTer.add(ter.mul(value.amount));
        annual = annual.add(annualCost as Money);
      }
    }
    rows.push({
      asset_id: assetId,
      asset_class: asset.asset_class as AssetClass,
      fees_eur: feesEur,
      invested_eur: invested,
      ...(invested.isZero() ? {} : { fees_pct: feesEur.amount.div(invested.amount).mul(HUNDRED) }),
      ...(ter === undefined ? {} : { ter }),
      ...(value === undefined ? {} : { value_eur: value }),
      ...(annualCost === undefined ? {} : { annual_cost_eur: annualCost }),
    });
  }

  return {
    date,
    core: {
      rows,
      totals: {
        fees_eur: rows.reduce((sum, row) => sum.add(row.fees_eur), Money.zero(EUR)),
        invested_eur: rows.reduce((sum, row) => sum.add(row.invested_eur), Money.zero(EUR)),
        value_eur: valued,
        ...(valued.isZero() ? {} : { weighted_ter: weightedTer.div(valued.amount) }),
        ...(valued.isZero() ? {} : { annual_cost_eur: annual }),
        partial,
      },
    },
    bucket: bucketBlockOf(totals),
    standalone: standaloneBlockOf(state, totals),
  };
};
