// Total net worth (specification §3.2, business rule 18, feature 005 §3.1).
//
// The **only** view that adds the two books, and it does so as a budget control
// with the breakdown always in sight: constitution III writes it as its second
// bounded exception. It never returns a single undecomposed number, and nothing
// else in the application consumes its total except the warning of rule 18.
//
// Cash in a foreign currency is converted with the last rate the ledger knows
// for that currency, and the row says **from when** that rate is: a rate two
// years old is not today's data and must not be dressed up as one. A currency
// the ledger never priced is shown unconverted and makes the total partial.

import { type CivilDate, daysBetween } from "../dates/civil-date.js";
import { Decimal } from "../money/decimal.js";
import { FxRate } from "../money/fx-rate.js";
import type { Currency } from "../money/money.js";
import { Money } from "../money/money.js";
import type { AccountId, AssetId } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import { type BucketPosition, bucketPositions, warn } from "./bucket.js";
import type { ExternalPrices } from "./prices.js";
import type { LedgerState, Warning } from "./state.js";
import { type ClassSubtotal, coreWeights } from "./weights.js";

const EUR = "EUR";

export interface NetWorthAssetRow {
  account_id?: AccountId;
  asset_id: AssetId;
  value_eur?: Money;
}

export interface CoreBlock {
  by_class: ClassSubtotal[];
  total_eur: Money;
  partial: boolean;
  missing_prices: AssetId[];
}

export interface BucketBlock {
  rows: NetWorthAssetRow[];
  total_eur: Money;
  partial: boolean;
  missing_prices: AssetId[];
}

export interface CashLine {
  account_id: AccountId;
  currency: Currency;
  balance: Money;
  /** Absent for euros and when the ledger knows no rate for the currency. */
  fx_rate?: FxRate;
  /** Days from the rate to the date asked. */
  fx_age_days?: number;
  fx_stale?: boolean;
  /** The rate came with its own `fx_rate_date`; otherwise its date is the business date of its event. */
  fx_rate_dated?: boolean;
  /** Absent = "not converted": never a zero. */
  value_eur?: Money;
}

export interface CashBlock {
  rows: CashLine[];
  total_eur: Money;
  partial: boolean;
  missing_rates: Currency[];
}

export interface NetWorth {
  date: CivilDate;
  core: CoreBlock;
  bucket: BucketBlock;
  cash: CashBlock;
  /** Sum of the three blocks, of what does have a value. Read it with `partial`. */
  total_eur: Money;
  partial: boolean;
  /**
   * What each block weighs in the total, in percent and exact. **Absent** when
   * the total is partial or not positive: a share of an incomplete total is
   * not a share of anything (rule 18 refuses it for the same reason).
   */
  share_pct?: NetWorthShares;
  warnings: Warning[];
}

export interface NetWorthShares {
  core: Decimal;
  bucket: Decimal;
  cash: Decimal;
}

const HUNDRED = Decimal.parse("100");

const sharesOf = (
  total: Money,
  blocks: { core: Money; bucket: Money; cash: Money },
): NetWorthShares => {
  const of = (part: Money): Decimal => part.amount.div(total.amount).mul(HUNDRED);
  return { core: of(blocks.core), bucket: of(blocks.bucket), cash: of(blocks.cash) };
};

const bucketRowOf = (row: BucketPosition): NetWorthAssetRow => ({
  account_id: row.account_id,
  asset_id: row.asset_id,
  ...(row.value_eur === undefined ? {} : { value_eur: row.value_eur }),
});

/** Cash by account and currency, converted with the last rate the ledger knows. */
const cashBlockOf = (
  state: LedgerState,
  date: CivilDate,
  settings: Settings,
  warnings: Warning[],
): CashBlock => {
  const rows: CashLine[] = [];
  const missing: Currency[] = [];
  let total = Money.zero(EUR);
  for (const [key, balance] of state.cash) {
    if (balance.isZero()) {
      continue;
    }
    const [account_id, currency] = key.split("|") as [AccountId, Currency];
    if (currency === EUR) {
      rows.push({ account_id, currency, balance, value_eur: balance });
      total = total.add(balance);
      continue;
    }
    const known = state.fxRates.get(currency);
    // Defence in depth, like `priceAt` with a valuation from the future: a view
    // asked for a past date projects with `asOf` (ADR-0016), so a rate dated
    // later cannot normally be here; if it is, the honest answer is that the
    // ledger knew no rate **then**, not a conversion at tomorrow's rate.
    if (known === undefined || known.date > date) {
      rows.push({ account_id, currency, balance });
      if (!missing.includes(currency)) {
        missing.push(currency);
      }
      continue;
    }
    const rate = FxRate.of(known.rate, currency, known.date);
    const value = rate.toEur(balance);
    const ageDays = daysBetween(known.date, date);
    const stale = settings.stale_price_days !== undefined && ageDays > settings.stale_price_days;
    if (stale) {
      warn(
        warnings,
        "stale_fx_rate",
        `the rate used for ${currency} is ${ageDays} days old (${known.date}, limit ${settings.stale_price_days})`,
        { currency, age_days: ageDays, date: known.date },
        known.event_id,
      );
    }
    rows.push({
      account_id,
      currency,
      balance,
      fx_rate: rate,
      fx_age_days: ageDays,
      fx_stale: stale,
      fx_rate_dated: known.dated,
      value_eur: value,
    });
    total = total.add(value);
  }
  rows.sort((a, b) =>
    a.account_id === b.account_id
      ? a.currency.localeCompare(b.currency)
      : a.account_id.localeCompare(b.account_id),
  );
  return { rows, total_eur: total, partial: missing.length > 0, missing_rates: missing };
};

/** Total net worth at a date, always broken down (§3.1). */
export const netWorth = (
  state: LedgerState,
  date: CivilDate,
  settings: Settings,
  external?: ExternalPrices,
): NetWorth => {
  const warnings: Warning[] = [];
  const core = coreWeights(state, date, settings, external);
  const bucket = bucketPositions(state, date, settings, external);
  const cash = cashBlockOf(state, date, settings, warnings);
  const total = core.total_eur.add(bucket.total_value_eur).add(cash.total_eur);
  const partial = core.partial || bucket.partial || cash.partial;
  if (partial) {
    warn(
      warnings,
      "partial_net_worth",
      `the total at ${date} covers only what has a price and a rate: missing ${[
        ...core.missing_prices,
        ...bucket.missing_prices,
        ...cash.missing_rates,
      ].join(", ")}`,
      {
        assets: [...core.missing_prices, ...bucket.missing_prices],
        currencies: cash.missing_rates,
        date,
      },
    );
  }
  return {
    date,
    core: {
      by_class: core.by_class,
      total_eur: core.total_eur,
      partial: core.partial,
      missing_prices: core.missing_prices,
    },
    bucket: {
      rows: bucket.rows.map(bucketRowOf),
      total_eur: bucket.total_value_eur,
      partial: bucket.partial,
      missing_prices: bucket.missing_prices,
    },
    cash,
    total_eur: total,
    partial,
    ...(partial || !total.amount.isPositive()
      ? {}
      : {
          share_pct: sharesOf(total, {
            core: core.total_eur,
            bucket: bucket.total_value_eur,
            cash: cash.total_eur,
          }),
        }),
    warnings,
  };
};
