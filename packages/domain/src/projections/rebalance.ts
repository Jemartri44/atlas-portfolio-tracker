// Rebalance proposal (feature 028, business rules 2, 3 and 4).
//
// A pure query that proposes how to bring the core back towards its target
// weights and never writes: the orders are placed by hand and recorded as
// always. It tries the cheapest instrument first and stops short of what costs:
//
//   1. new money, if the owner has some (the same split as the monthly
//      contribution: purchases, no tax);
//   2. transfers between funds (business-rules.md §5.2: no tax, the lots keep
//      date and cost);
//   3. sales, only of what is still above its target, with the estimated tax
//      and the commissions shown before anyone decides.
//
// Nothing is proposed unless an asset is beyond `deviation_threshold_pp` (rule
// 3). The bucket never appears: its assets are not in the core (rule 21).
// Selling goes from the furthest above its target to the nearest, never
// proportionally from everything (rule 4).

import type { CivilDate } from "../dates/civil-date.js";
import { ValidationError } from "../errors.js";
import { Decimal, HUNDRED } from "../money/decimal.js";
import { EUR, Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import type { AccountId, AssetClass, AssetId, LedgerEvent } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import type { TransmissionLot } from "../tax/report.js";
import { fillByLevel, purchasesOnlyOf, splitCore } from "./contribution.js";
import { holdersOf, type Order, type PlatformPlan, platformPlan } from "./platform-plan.js";
import type { ExternalPrices, PriceLookup } from "./prices.js";
import {
  estimateOrders,
  type RefusedOrder,
  type SaleEstimate,
  type SaleOrder,
  summariseEstimates,
} from "./sale-tax.js";

export type { SaleOrder };

import type { Account, LedgerState, Warning } from "./state.js";
import { transferBlock } from "./transfer-rule.js";
import { coreWeights } from "./weights.js";

const ZERO = Money.zero(EUR);

export interface RebalanceInput {
  date: CivilDate;
  settings: Settings;
  /** New money for the core, in euros, already without the share of the bucket. */
  amount?: string;
  external?: ExternalPrices;
  /** The account the owner picked for an asset that sits in none. */
  choose?: ReadonlyMap<AssetId, AccountId>;
}

export interface DiagnosisRow {
  asset_id: AssetId;
  asset_class: AssetClass;
  target_pct: Decimal;
  value_eur: Money;
  weight_pct: Decimal;
  /** `weight − target`, in percentage points. */
  deviation_pp: Decimal;
  /** More than `deviation_threshold_pp` away from its target, in either direction (rule 3). */
  beyond_threshold: boolean;
}

/** Where the core stands if the plan stops at a step. */
export interface StepOutcome {
  weights: { asset_id: AssetId; weight_pct: Decimal; deviation_pp: Decimal }[];
  max_deviation_pp: Decimal;
}

export interface ContributionStep {
  kind: "contribution";
  outcome: StepOutcome;
  amount_eur: Money;
  platforms: PlatformPlan;
}

/** A move between two funds: not a taxable event, not a sale followed by a purchase. */
export interface TransferStep {
  kind: "transfer";
  outcome: StepOutcome;
  from_asset_id: AssetId;
  to_asset_id: AssetId;
  amount_eur: Money;
  /** Approximate, at the informative price; funds move by amount. */
  quantity: Quantity;
  from_account_id?: AccountId;
  to_account_id?: AccountId;
}

export type SaleTax =
  | {
      available: true;
      /** Estimated with the scale of the year (criterion #27). */
      tax_eur: Money;
      gain_eur: Money;
      cost_eur: Money;
      lots: TransmissionLot[];
      deferred_eur: Money;
      deferral_window_end?: CivilDate;
    }
  | { available: false; code: string };

export interface SaleStep {
  kind: "sale";
  outcome: StepOutcome;
  asset_id: AssetId;
  amount_eur: Money;
  orders: SaleOrder[];
  tax: SaleTax;
  /** What the proceeds buy, grouped by platform. */
  buys: PlatformPlan;
}

export type RebalanceStep = ContributionStep | TransferStep | SaleStep;

/** The money that has to move into (positive) or out of (negative) a platform. */
export interface CashMove {
  account_id: AccountId;
  platform: string;
  buy_eur: Money;
  sell_eur: Money;
  fees_eur: Money;
  /** `purchases + known fees − sales`: positive, money has to arrive; negative, it is freed. */
  net_eur: Money;
}

export interface RebalancePlan {
  date: CivilDate;
  threshold_pp: Decimal;
  core_value_eur: Money;
  new_money_eur: Money;
  /** Before any step. */
  diagnosis: DiagnosisRow[];
  /**
   * `within_threshold`: nothing is beyond the threshold once the new money is
   * placed. `only_deficits`: something is below its target by more than the
   * threshold but nothing is above it, so only buying can fix it. `steps`:
   * there is something to move.
   */
  status: "within_threshold" | "only_deficits" | "steps";
  steps: RebalanceStep[];
  cash: CashMove[];
  /** New money that would take every asset to its target by purchases alone, after the new money. */
  purchases_only_eur: Money;
  warnings: Warning[];
}

interface Item {
  asset_id: AssetId;
  asset_class: AssetClass;
  target_pct: Decimal;
  value: Money;
  /** Its price: units and amounts are converted with one division, not through a rounded unit. */
  price: PriceLookup | undefined;
}

const fail = (code: string, message: string, details: Record<string, unknown> = {}): never => {
  throw new ValidationError(code, message, details);
};

/** Rounds every part to cents and puts the residue on the largest, so they add up to `total`. */
export const roundSplit = (parts: readonly Money[], total: Money): Money[] => {
  const rounded = parts.map((part) => part.roundToCents());
  const residue = total.sub(rounded.reduce((sum, part) => sum.add(part), ZERO));
  if (!residue.isZero()) {
    let largest = 0;
    parts.forEach((part, index) => {
      if (part.cmp(parts[largest] as Money) > 0) {
        largest = index;
      }
    });
    rounded[largest] = (rounded[largest] as Money).add(residue);
  }
  return rounded;
};

const targetOf = (item: Item, whole: Money): Money => whole.mul(item.target_pct).div(HUNDRED);

const outcomeOf = (items: readonly Item[], whole: Money): StepOutcome => {
  let max = Decimal.ZERO;
  const weights = items.map((item) => {
    // Only called once a step exists, and a step needs value in the core.
    const weight = item.value.amount.div(whole.amount).mul(HUNDRED);
    const deviation = weight.sub(item.target_pct);
    max = deviation.abs().gt(max) ? deviation.abs() : max;
    return { asset_id: item.asset_id, weight_pct: weight, deviation_pp: deviation };
  });
  return { weights, max_deviation_pp: max };
};

const move = (item: Item, delta: Money): void => {
  item.value = item.value.add(delta);
};

/** How far above its target an item stands, in percentage points of `whole`. */
const deviationPp = (item: Item, whole: Money): Decimal =>
  whole.isZero()
    ? Decimal.ZERO
    : item.value.amount.div(whole.amount).mul(HUNDRED).sub(item.target_pct);

interface Leg {
  from: Item;
  to: Item;
  amount: Money;
}

/** Pairs what leaves the sources with what the destinations take, in order, without crossing blocked pairs. */
const pair = (
  sources: readonly { item: Item; amount: Money }[],
  destinations: readonly { item: Item; amount: Money }[],
  allowed: (from: Item, to: Item) => boolean,
): Leg[] => {
  const legs: Leg[] = [];
  const left = destinations.map((destination) => destination.amount);
  for (const source of sources) {
    let remaining = source.amount;
    destinations.forEach((destination, index) => {
      const room = left[index] as Money;
      if (!remaining.amount.isPositive() || !room.amount.isPositive()) {
        return;
      }
      if (!allowed(source.item, destination.item)) {
        return;
      }
      const amount = remaining.cmp(room) < 0 ? remaining : room;
      legs.push({ from: source.item, to: destination.item, amount });
      remaining = remaining.sub(amount);
      left[index] = room.sub(amount);
    });
  }
  return legs;
};

const optional = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } =>
  (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };

/**
 * Units that `amount` buys at `price`; it comes from a priced position, so the price is positive
 * and has its rate. One division, at the end: the unit value in euros is rounded.
 */
const quantityOf = (amount: Money, price: PriceLookup): Quantity =>
  Quantity.of(amount.amount.mul(price.fx_rate as Decimal).div(price.unit_value));

export const rebalancePlan = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  input: RebalanceInput,
): RebalancePlan => {
  const { settings, date } = input;
  if (settings.target_weights === undefined) {
    fail("missing_target_weights", "target_weights is not configured");
  }
  if (settings.deviation_threshold_pp === undefined) {
    fail("missing_deviation_threshold", "deviation_threshold_pp is not configured");
  }
  const threshold = Decimal.parse(settings.deviation_threshold_pp as string);
  const weights = coreWeights(state, date, settings, input.external);
  if (weights.missing_prices.length > 0) {
    fail("missing_manual_prices", "some core assets held have no price in euros", {
      assets: weights.missing_prices,
      date,
    });
  }
  if (weights.rows.reduce((sum, row) => sum.add(row.target_pct), Decimal.ZERO).isZero()) {
    fail(
      "no_target_weight_in_table",
      "the target weights in force do not point at any asset of the core table",
      { assets: weights.rows.map((row) => row.asset_id), date },
    );
  }
  const newMoney = input.amount === undefined ? ZERO : Money.parse(input.amount, EUR);
  if (newMoney.isNegative()) {
    fail("invalid_amount", "the new money cannot be negative", { value: input.amount });
  }

  const items: Item[] = weights.rows.map((row) => ({
    asset_id: row.asset_id,
    asset_class: row.asset_class,
    target_pct: row.target_pct,
    value: row.value_eur as Money,
    price: row.price,
  }));
  const whole = weights.total_eur.add(newMoney);
  const diagnosis: DiagnosisRow[] = items.map((item) => {
    const weight = weights.total_eur.isZero()
      ? Decimal.ZERO
      : item.value.amount.div(weights.total_eur.amount).mul(HUNDRED);
    const deviation = weight.sub(item.target_pct);
    return {
      asset_id: item.asset_id,
      asset_class: item.asset_class,
      target_pct: item.target_pct,
      value_eur: item.value,
      weight_pct: weight,
      deviation_pp: deviation,
      beyond_threshold: deviation.abs().gt(threshold),
    };
  });

  const steps: RebalanceStep[] = [];
  const cash = new Map<AccountId, { buy: Money; sell: Money; fees: Money }>();
  const entryOf = (account: AccountId) =>
    cash.get(account) ?? { buy: ZERO, sell: ZERO, fees: ZERO };
  const bookBuys = (plan: PlatformPlan) => {
    for (const row of plan.rows) {
      const entry = entryOf(row.account_id);
      cash.set(row.account_id, {
        ...entry,
        buy: entry.buy.add(row.buy_eur),
        fees: entry.fees.add(row.fees_eur),
      });
    }
  };
  const bookSale = (order: SaleOrder) => {
    const entry = entryOf(order.account_id);
    cash.set(order.account_id, {
      ...entry,
      sell: entry.sell.add(order.amount_eur),
      fees: entry.fees.add(order.fee?.fee_eur ?? ZERO),
    });
  };

  // Step 1: the new money, split exactly like the monthly contribution.
  if (newMoney.amount.isPositive()) {
    const { slices } = splitCore(
      items.map((item) => ({
        asset_id: item.asset_id,
        asset_class: item.asset_class,
        target_pct: item.target_pct,
        value_eur: item.value,
      })),
      weights.total_eur,
      newMoney,
    );
    const orders: Order[] = [];
    slices.forEach((slice, index) => {
      move(items[index] as Item, slice.allocation_eur);
      orders.push({ asset_id: slice.asset_id, amount_eur: slice.allocation_eur });
    });
    const platforms = platformPlan(state, events, date, orders, input.choose);
    bookBuys(platforms);
    steps.push({
      kind: "contribution",
      outcome: outcomeOf(items, whole),
      amount_eur: newMoney,
      platforms,
    });
  }
  const purchasesOnly = purchasesOnlyOf(
    items.map((item) => ({ target_pct: item.target_pct, value_eur: item.value })),
    whole,
  );

  const sources = (): { item: Item; amount: Money }[] =>
    items
      .filter((item) => deviationPp(item, whole).gt(threshold))
      .map((item) => ({ item, amount: item.value.sub(targetOf(item, whole)).roundToCents() }))
      .filter((entry) => entry.amount.amount.isPositive())
      .sort((a, b) => b.amount.cmp(a.amount));
  const deficits = (): { item: Item; gap: Money }[] =>
    items
      .map((item) => ({ item, gap: targetOf(item, whole).sub(item.value) }))
      .filter((entry) => entry.gap.amount.isPositive());

  const beyond = items.some((item) => deviationPp(item, whole).abs().gt(threshold));
  let status: RebalancePlan["status"] = beyond ? "only_deficits" : "within_threshold";

  if (beyond && sources().length > 0) {
    const movable = (list: { item: Item }[]) =>
      list.filter((entry) => state.assets.get(entry.item.asset_id)?.transferable === true);
    const allowed = (from: Item, to: Item): boolean => {
      const a = state.assets.get(from.asset_id);
      const b = state.assets.get(to.asset_id);
      return (
        a !== undefined &&
        b !== undefined &&
        transferBlock(a, b, settings.tax_residence) === undefined
      );
    };

    // Step 2: transfers between funds, from the furthest above to the furthest below.
    const from = movable(sources()) as { item: Item; amount: Money }[];
    const to = movable(deficits()) as { item: Item; gap: Money }[];
    const available = from.reduce((sum, entry) => sum.add(entry.amount), ZERO);
    const room = to.reduce((sum, entry) => sum.add(entry.gap), ZERO);
    const total = (available.cmp(room) < 0 ? available : room).roundToCents();
    if (total.amount.isPositive()) {
      let left = total;
      const taken = from.map((entry) => {
        const amount = entry.amount.cmp(left) < 0 ? entry.amount : left;
        left = left.sub(amount);
        return { item: entry.item, amount };
      });
      const given = roundSplit(
        fillByLevel(
          to.map((entry) => entry.gap),
          total,
        ),
        total,
      ).map((amount, index) => ({ item: (to[index] as { item: Item }).item, amount }));
      for (const leg of pair(taken, given, allowed)) {
        move(leg.from, leg.amount.neg());
        move(leg.to, leg.amount);
        steps.push({
          kind: "transfer",
          outcome: outcomeOf(items, whole),
          from_asset_id: leg.from.asset_id,
          to_asset_id: leg.to.asset_id,
          amount_eur: leg.amount,
          quantity: quantityOf(leg.amount, leg.from.price as PriceLookup),
          ...optional("from_account_id", holdersOf(state, leg.from.asset_id)[0]?.account_id),
          ...optional("to_account_id", holdersOf(state, leg.to.asset_id)[0]?.account_id),
        });
      }
    }

    // Step 3: sales of what is still above its target, as far as purchases can absorb.
    const toSell = sources();
    const toBuy = deficits();
    const sellable = toSell.reduce((sum, entry) => sum.add(entry.amount), ZERO);
    const buyable = toBuy.reduce((sum, entry) => sum.add(entry.gap), ZERO);
    const volume = (sellable.cmp(buyable) < 0 ? sellable : buyable).roundToCents();
    if (volume.amount.isPositive()) {
      let left = volume;
      const sold = toSell
        .map((entry) => {
          const amount = entry.amount.cmp(left) < 0 ? entry.amount : left;
          left = left.sub(amount);
          return { item: entry.item, amount };
        })
        .filter((entry) => entry.amount.amount.isPositive());
      const bought = roundSplit(
        fillByLevel(
          toBuy.map((entry) => entry.gap),
          volume,
        ),
        volume,
      ).map((amount, index) => ({ item: (toBuy[index] as { item: Item }).item, amount }));
      const hypothetical: LedgerEvent[] = [];
      for (const leg of splitLegs(sold, bought)) {
        const step = saleStep(state, events, date, settings, leg, hypothetical);
        for (const order of step.orders) {
          bookSale(order);
        }
        step.buys = platformPlan(state, events, date, leg.buys, input.choose);
        bookBuys(step.buys);
        move(leg.item, leg.amount.neg());
        for (const buy of leg.buys) {
          move(items.find((item) => item.asset_id === buy.asset_id) as Item, buy.amount_eur);
        }
        step.outcome = outcomeOf(items, whole);
        steps.push(step);
      }
    }
    status = steps.some((step) => step.kind !== "contribution") ? "steps" : "only_deficits";
  }

  const moves: CashMove[] = [...cash.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([account_id, entry]) => ({
      account_id,
      platform: (state.accounts.get(account_id) as Account).platform,
      buy_eur: entry.buy,
      sell_eur: entry.sell,
      fees_eur: entry.fees,
      net_eur: entry.buy.add(entry.fees).sub(entry.sell),
    }));
  return {
    date,
    threshold_pp: threshold,
    core_value_eur: weights.total_eur,
    new_money_eur: newMoney,
    diagnosis,
    status,
    steps,
    cash: moves,
    purchases_only_eur: purchasesOnly,
    warnings: weights.warnings,
  };
};

/** One seller with the purchases its proceeds finance, in the order of the destinations. */
interface SaleLeg {
  item: Item;
  amount: Money;
  buys: Order[];
}

const splitLegs = (
  sold: readonly { item: Item; amount: Money }[],
  bought: readonly { item: Item; amount: Money }[],
): SaleLeg[] => {
  const room = bought.map((entry) => entry.amount);
  return sold.map((sale) => {
    let remaining = sale.amount;
    const buys: Order[] = [];
    bought.forEach((destination, index) => {
      const free = room[index] as Money;
      if (!remaining.amount.isPositive() || !free.amount.isPositive()) {
        return;
      }
      const amount = remaining.cmp(free) < 0 ? remaining : free;
      buys.push({ asset_id: destination.item.asset_id, amount_eur: amount });
      remaining = remaining.sub(amount);
      room[index] = free.sub(amount);
    });
    return { item: sale.item, amount: sale.amount, buys };
  });
};

/**
 * Orders and estimated tax of selling `leg.amount` of an asset. The quantity is
 * taken from the accounts that hold it, largest position first, because an
 * order is placed in one account even though the FIFO is across all of them
 * (ADR-0009). `hypothetical` collects the planned sales so each estimate sees
 * the ones before it.
 */
const saleStep = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  date: CivilDate,
  settings: Settings,
  leg: SaleLeg,
  hypothetical: LedgerEvent[],
): SaleStep => {
  const assetId = leg.item.asset_id;
  const priced = leg.item.price as PriceLookup;
  const { orders, estimates } = estimateOrders(
    state,
    events,
    {
      date,
      brackets: settings.savings_tax_brackets,
      asset_id: assetId,
      quantity: quantityOf(leg.amount, priced),
      price: priced,
      book: "core",
      total_eur: leg.amount,
    },
    hypothetical,
  );
  const failed = estimates.find((entry): entry is RefusedOrder => "code" in entry);
  const done = estimates.filter((entry): entry is SaleEstimate => !("code" in entry));
  return {
    kind: "sale",
    outcome: { weights: [], max_deviation_pp: Decimal.ZERO },
    asset_id: assetId,
    amount_eur: leg.amount,
    orders,
    tax:
      failed !== undefined
        ? { available: false, code: failed.code }
        : { available: true, ...summariseEstimates(done) },
    buys: { rows: [], unassigned: [] },
  };
};
