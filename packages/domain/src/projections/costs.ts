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
  BuyEvent,
  CorporateActionEvent,
  LedgerEvent,
  SellEvent,
} from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { type ManualPrice, manualPrices } from "./prices.js";
import { businessDateOf, isOperationEvent } from "./project-ledger.js";
import type { LedgerState } from "./state.js";
import { coreQuantityOf } from "./weights.js";

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
}

export interface CostSummary {
  date: CivilDate;
  core: { rows: CoreCostRow[]; totals: CoreCostTotals };
  bucket: { rows: BucketCostRow[] };
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

interface Accumulator {
  fees: Map<AssetId, Money>;
  invested: Map<AssetId, Money>;
  bucketFees: Map<AccountId, Money>;
}

const addTo = <K>(map: Map<K, Money>, key: K, amount: Money): void => {
  map.set(key, (map.get(key) ?? Money.zero(EUR)).add(amount));
};

/** Books one trade under its asset (core) or its account (bucket). */
const bookTrade = (state: LedgerState, totals: Accumulator, event: BuyEvent | SellEvent): void => {
  const fee = feeEurOf(event);
  if (state.accounts.get(event.account_id)?.book === "bucket") {
    addTo(totals.bucketFees, event.account_id, fee);
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
  const totals: Accumulator = { fees: new Map(), invested: new Map(), bucketFees: new Map() };
  for (const event of events) {
    // A reversed event never happened, so neither did its commission.
    if (state.reversed.has(event.id)) {
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
    if (event.type === "corporate_action") {
      // Each entry names the account the broker charged, so the charge lands in
      // the right book even when the position was fully cashed out.
      for (const { asset_id, account_id, fee } of forcedSaleFees(event)) {
        if (state.accounts.get(account_id)?.book === "bucket") {
          addTo(totals.bucketFees, account_id, fee);
          continue;
        }
        addTo(totals.fees, asset_id, fee);
      }
    }
  }
  return totals;
};

const annualCostOf = (ter: Decimal | undefined, value: Money | undefined): Money | undefined =>
  ter === undefined || value === undefined ? undefined : value.mul(ter).div(HUNDRED);

/** Value of a position at its manual price, or nothing without a price. */
const positionValueOf = (price: ManualPrice | undefined, quantity: Quantity): Money | undefined =>
  price === undefined ? undefined : Money.of(price.unit_value_eur.amount.mul(quantity.value), EUR);

export const costSummary = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  date: CivilDate,
  settings: Settings,
  /** Business-date cut, the same one the projection was given (`ProjectOptions.asOf`). */
  asOf?: CivilDate,
): CostSummary => {
  const totals = accumulate(state, events, asOf);
  const prices = manualPrices(state, date, settings);
  const rows: CoreCostRow[] = [];
  let partial = false;
  let valued = Money.zero(EUR);
  let annual = Money.zero(EUR);
  let weightedTer = Decimal.ZERO;

  for (const [assetId, asset] of state.assets) {
    if (asset.book !== "core") {
      continue;
    }
    const quantity = coreQuantityOf(state, assetId);
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
    if (quantity.isPositive() && price === undefined) {
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
    bucket: {
      rows: [...totals.bucketFees].map(([account_id, fees_eur]) => ({ account_id, fees_eur })),
    },
  };
};
