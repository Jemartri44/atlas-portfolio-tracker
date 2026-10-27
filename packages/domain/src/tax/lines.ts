// The lines of the tax report: each transmission with its lots and their
// lineage back to the acquisition that created them, each dividend and
// interest, each deductible fee and each withholding — every one with its
// original amount, the ECB rate as published and its date (ADR-0013), and the
// fiscal criteria it depends on.
//
// Nothing here reads a price: every amount is the consideration the operation
// itself recorded.

import { type CivilDate, compareCivilDates } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { Decimal } from "../money/decimal.js";
import { FxRate } from "../money/fx-rate.js";
import { EUR, Money } from "../money/money.js";
import { type CurrencyGain, type CurrencyLot, currencyLots } from "../projections/currency-lots.js";
import { swapValuation } from "../projections/operations.js";
import type {
  FiscalLot,
  InvestmentIncome,
  LedgerState,
  RealizedGain,
} from "../projections/state.js";
import {
  type AssetType,
  type BuyEvent,
  type CorporateActionEvent,
  type DividendEvent,
  type ForcedSaleEffect,
  feeKindOf,
  type GrantEffect,
  type LedgerEvent,
  type SellEvent,
  type StandaloneFeeEvent,
  type SwapEvent,
} from "../schema/events.js";
import { type IncomeCategory, incomeCategoryOf, type Settings } from "../settings/settings.js";
import { type CriterionId, categoryCriterion, sortCriteria } from "./criteria.js";
import type {
  Converted,
  CurrencyLine,
  DeferralLine,
  ExpenseLine,
  IncomeLine,
  LineageStep,
  ReleaseLine,
  RootAcquisition,
  TransmissionLine,
  TransmissionLot,
  WithholdingLine,
} from "./report.js";
import type { Deferral, Release, WashSaleOutcome, WashSaleResult } from "./wash-sale.js";

export interface LineContext {
  state: LedgerState;
  settings: Settings;
  events: Map<Ulid, LedgerEvent>;
  lots: Map<string, FiscalLot>;
  /** Lots a carve-out took cost from or gave cost to (#7). */
  carved: Set<string>;
  walk: WashSaleResult;
}

const LISTED: ReadonlySet<AssetType> = new Set(["stock", "etf", "etc", "etp"]);

/**
 * Which variant of criterion #2 applies: by the type of asset **and the window
 * applied**, or by article 25.2.b) when the asset yields movable capital income.
 */
export const windowCriterion = (
  type: AssetType,
  window: string,
  category: IncomeCategory = "capital_gain",
): CriterionId => {
  if (category === "movable_capital") {
    return "2:movable_capital";
  }
  if (LISTED.has(type)) {
    return window === "2m" ? "2:listed" : window === "1y" ? "2:listed_1y" : "2:other";
  }
  if (type === "crypto") {
    return window === "1y" ? "2:crypto" : window === "2m" ? "2:crypto_2m" : "2:other";
  }
  // A year is no longer a window nobody supports: it is the conservative side
  // of the same dispute, and it is labelled as such (criterion #2).
  return window === "2m" ? "2:fund_2m" : window === "1y" ? "2:fund_1y" : "2:other";
};

const money = (amount: string, currency: string): Money => Money.parse(amount, currency);

const convert = (amount: Money, rate: string, date: CivilDate): Converted => ({
  amount,
  fx_rate: rate,
  fx_rate_date: date,
  eur: FxRate.of(Decimal.parse(rate), amount.currency, date).toEur(amount),
});

/** What the operation recorded about the disposal: currency, rate, gross, fee, withholding. */
interface SaleFacts {
  event_type: "sell" | "forced_sale" | "swap";
  kind?: string;
  currency: string;
  fx_rate: string;
  fx_rate_date: CivilDate;
  gross: Money;
  fee: Money;
  withholding: Money;
  /** The forced sale is the cash of an exchange, before or after its conversion (#13). */
  cash_leg_of_exchange: boolean;
}

/**
 * The forced sale of a corporate action that booked this gain: same asset, same
 * account. An action may sell the same asset in the same account more than
 * once, so `nth` says which of them: the gains of one action come in the order
 * of its effects.
 */
const forcedSaleOf = (
  event: CorporateActionEvent,
  gain: RealizedGain,
  nth: number,
): ForcedSaleEffect =>
  event.effects.filter(
    (effect) =>
      effect.op === "forced_sale" &&
      (effect.asset_id ?? event.asset_id) === gain.asset_id &&
      effect.per_account.some((entry) => entry.account_id === gain.account_id),
  )[nth] as ForcedSaleEffect;

const saleFacts = (event: LedgerEvent, gain: RealizedGain, nth: number): SaleFacts => {
  if (event.type === "sell") {
    const sell = event as SellEvent;
    const gross =
      sell.amount === undefined
        ? money(sell.unit_price as string, sell.currency).mul(Decimal.parse(sell.quantity))
        : money(sell.amount, sell.currency);
    return {
      event_type: "sell",
      currency: sell.currency,
      fx_rate: sell.fx_rate,
      fx_rate_date: sell.fx_rate_date,
      gross,
      fee: money(sell.fee, sell.currency),
      withholding: money(sell.withholding ?? "0", sell.currency),
      cash_leg_of_exchange: false,
    };
  }
  if (event.type === "swap") {
    const swap = event as SwapEvent;
    return {
      event_type: "swap",
      currency: swap.currency,
      fx_rate: swap.fx_rate,
      fx_rate_date: swap.fx_rate_date,
      gross: swapValuation(swap),
      fee: money(swap.fee, swap.currency),
      withholding: Money.zero(swap.currency),
      cash_leg_of_exchange: false,
    };
  }
  const action = event as CorporateActionEvent;
  const effect = forcedSaleOf(action, gain, nth);
  const entry = effect.per_account.find((e) => e.account_id === gain.account_id) as {
    fee?: string;
    withholding?: string;
  };
  // The cash of an exchange, before the conversion (a cash component of the old
  // shares) or after it (the fractions of the new ones): #13 either way.
  const exchanges = action.effects.some((other) => other.op === "convert");
  return {
    event_type: "forced_sale",
    kind: action.kind,
    currency: effect.currency,
    fx_rate: effect.fx_rate,
    fx_rate_date: effect.fx_rate_date,
    gross: money(effect.unit_price, effect.currency).mul(gain.quantity.value),
    fee: money(entry.fee ?? "0", effect.currency),
    withholding: money(entry.withholding ?? "0", effect.currency),
    cash_leg_of_exchange:
      (action.kind === "merger" || action.kind === "issuer_restructuring") && exchanges,
  };
};

const typeOf = (event: LedgerEvent): string =>
  event.type === "corporate_action"
    ? `corporate_action:${(event as CorporateActionEvent).kind}`
    : event.type;

/** The lot, its ancestors through `source_lot_id`, and the acquisition at the root. */
export const lineageOf = (
  ctx: LineContext,
  lotId: string,
): { steps: LineageStep[]; root: RootAcquisition; carved: boolean; fork: boolean } => {
  const steps: LineageStep[] = [];
  let carved = false;
  let lot = ctx.lots.get(lotId) as FiscalLot;
  for (;;) {
    carved = carved || ctx.carved.has(lot.id);
    const event = ctx.events.get(lot.source_event_id) as LedgerEvent;
    steps.push({
      lot_id: lot.id,
      asset_id: lot.asset_id,
      acquisition_date: lot.acquisition_date,
      event_id: lot.source_event_id,
      event_type: typeOf(event),
    });
    if (lot.source_lot_id === undefined) {
      break;
    }
    lot = ctx.lots.get(lot.source_lot_id) as FiscalLot;
  }
  const event = ctx.events.get(lot.source_event_id) as LedgerEvent;
  const { cost, fork } = rootCost(event, lot);
  return {
    steps,
    carved,
    fork,
    root: {
      event_id: lot.source_event_id,
      event_type: typeOf(event),
      asset_id: lot.asset_id,
      acquisition_date: lot.acquisition_date,
      quantity: lot.original_quantity,
      cost,
    },
  };
};

/** The original cost of a root lot, in the currency its acquisition recorded. */
const rootCost = (event: LedgerEvent, lot: FiscalLot): { cost: Converted; fork: boolean } => {
  if (event.type === "buy") {
    const buy = event as BuyEvent;
    const gross =
      buy.amount === undefined
        ? money(buy.unit_price as string, buy.currency).mul(Decimal.parse(buy.quantity))
        : money(buy.amount, buy.currency);
    return {
      cost: {
        ...convertedAs(gross.add(money(buy.fee, buy.currency)), buy),
        eur: lot.original_cost_eur,
      },
      fork: false,
    };
  }
  if (event.type === "swap") {
    const swap = event as SwapEvent;
    return {
      cost: { ...convertedAs(swapValuation(swap), swap), eur: lot.original_cost_eur },
      fork: false,
    };
  }
  // A root that is neither a buy nor a swap is a grant, and every kind that
  // admits one admits exactly one (data-schema.md §8.5).
  const action = event as CorporateActionEvent;
  const grant = action.effects.find((effect) => effect.op === "grant") as GrantEffect;
  const cost = money(grant.unit_cost, grant.currency).mul(lot.original_quantity.value);
  return {
    cost: { ...convertedAs(cost, grant), eur: lot.original_cost_eur },
    fork: action.kind === "crypto_fork" && cost.isZero(),
  };
};

const convertedAs = (
  amount: Money,
  priced: { fx_rate: string; fx_rate_date: CivilDate },
): Converted => ({
  amount,
  fx_rate: priced.fx_rate,
  fx_rate_date: priced.fx_rate_date,
  eur: Money.zero(EUR),
});

const releaseLine = (ctx: LineContext, release: Release): ReleaseLine => {
  const origin = ctx.state.gains[release.origin] as RealizedGain;
  const asset = ctx.state.assets.get(origin.asset_id) as { asset_type: AssetType };
  return {
    origin_event_id: origin.event_id,
    origin_fiscal_date: origin.fiscal_date,
    lot_id: release.lot_id,
    amount_eur: release.amount_eur,
    travelled: release.travelled,
    category: incomeCategoryOf(ctx.settings, asset.asset_type),
  };
};

export const deferralLine = (ctx: LineContext, deferral: Deferral): DeferralLine => {
  const outcome = ctx.walk.outcomes[deferral.origin] as WashSaleOutcome;
  const window = outcome.window as { window: string; start: CivilDate; end: CivilDate };
  return {
    event_id: deferral.event_id,
    asset_id: deferral.asset_id,
    fiscal_date: deferral.fiscal_date,
    amount_eur: deferral.amount_eur,
    amount_eur_rounded: deferral.amount_eur.roundToCents(),
    units: deferral.units,
    sold: deferral.sold,
    window: window.window,
    window_start: window.start,
    window_end: window.end,
    acquisitions: deferral.candidates.map((candidate) => ({
      event_id: candidate.event_id,
      fiscal_date: candidate.fiscal_date,
      units: candidate.units,
      amount_eur: candidate.amount_eur,
      timing: candidate.timing,
      via_transfer: candidate.via_transfer,
    })),
  };
};

/** The criteria a deferral carries, which a later release inherits. */
const deferralCriteria = (ctx: LineContext, outcome: WashSaleOutcome): CriterionId[] => {
  const gain = ctx.state.gains[outcome.gain_index] as RealizedGain;
  const type = (ctx.state.assets.get(gain.asset_id) as { asset_type: AssetType }).asset_type;
  const ids: CriterionId[] = [
    windowCriterion(
      type,
      (outcome.window as { window: string }).window,
      incomeCategoryOf(ctx.settings, type),
    ),
    "14",
  ];
  if (outcome.not_held) {
    ids.push("18");
  }
  if (outcome.used_before) {
    ids.push("19");
  }
  if (outcome.reapplied) {
    ids.push("21");
  }
  if (outcome.deferral?.candidates.some((candidate) => candidate.via_transfer) === true) {
    ids.push("2b");
  }
  return ids;
};

export const transmissionLine = (ctx: LineContext, outcome: WashSaleOutcome): TransmissionLine => {
  const gain = ctx.state.gains[outcome.gain_index] as RealizedGain;
  const event = ctx.events.get(gain.event_id) as LedgerEvent;
  const asset = ctx.state.assets.get(gain.asset_id) as {
    asset_type: AssetType;
    book: "core" | "bucket";
    market?: string;
  };
  const account = ctx.state.accounts.get(gain.account_id) as { book: "core" | "bucket" };
  // Which of the sales of the same asset in the same account this one is.
  const nth =
    event.type === "corporate_action"
      ? ctx.state.gains
          .slice(0, outcome.gain_index)
          .filter(
            (other) =>
              other.event_id === gain.event_id &&
              other.asset_id === gain.asset_id &&
              other.account_id === gain.account_id,
          ).length
      : 0;
  const facts = saleFacts(event, gain, nth);
  const criteria = new Set<CriterionId>(["3", "6"]);
  if (facts.event_type !== "forced_sale") {
    criteria.add("1");
  }
  if (facts.currency !== EUR || gain.fx_method !== undefined) {
    criteria.add("4");
  }
  if (gain.fx_method === "mixed") {
    criteria.add("4:mixed_currency");
  }
  // #5 is about which day's rate converts an amount: in euros nothing is converted.
  if (facts.currency !== EUR && facts.fx_rate_date < gain.fiscal_date) {
    criteria.add("5");
  }
  if (facts.event_type === "swap" && !facts.fee.isZero()) {
    criteria.add("17");
  }
  if (facts.kind === "issuer_liquidation") {
    criteria.add("9");
  }
  if (facts.cash_leg_of_exchange) {
    criteria.add("13");
  }
  if (asset.asset_type === "etc" || asset.asset_type === "etp") {
    criteria.add(
      categoryCriterion(asset.asset_type, incomeCategoryOf(ctx.settings, asset.asset_type)),
    );
  }
  const lots: TransmissionLot[] = gain.by_lot.map((slice) => {
    const lineage = lineageOf(ctx, slice.lot_id);
    if (lineage.carved) {
      criteria.add("7");
    }
    if (lineage.fork) {
      criteria.add("8");
    }
    return {
      lot_id: slice.lot_id,
      quantity: slice.quantity,
      cost_eur: slice.cost_eur,
      proceeds_eur: slice.proceeds_eur,
      gain_eur: slice.gain_eur,
      acquisition_date: lineage.root.acquisition_date,
      lineage: lineage.steps,
      root: lineage.root,
    };
  });
  if (outcome.window !== undefined) {
    for (const id of deferralCriteria(ctx, outcome)) {
      criteria.add(id);
    }
  }
  if (outcome.mixed_lots) {
    criteria.add("20");
  }
  for (const release of [...outcome.released, ...outcome.foreign_released]) {
    for (const id of deferralCriteria(ctx, ctx.walk.outcomes[release.origin] as WashSaleOutcome)) {
      criteria.add(id);
    }
    if (release.travelled) {
      criteria.add("15");
    }
  }
  const proceeds = facts.gross.sub(facts.fee);
  return {
    event_id: gain.event_id,
    event_type: facts.event_type,
    ...(facts.kind === undefined ? {} : { corporate_action_kind: facts.kind }),
    account_id: gain.account_id,
    book: account.book,
    asset_id: gain.asset_id,
    asset_type: asset.asset_type,
    ...(asset.market === undefined ? {} : { market: asset.market }),
    category: incomeCategoryOf(ctx.settings, asset.asset_type),
    fiscal_date: gain.fiscal_date,
    quantity: gain.quantity,
    proceeds: {
      amount: proceeds,
      fx_rate: facts.fx_rate,
      fx_rate_date: facts.fx_rate_date,
      eur: gain.proceeds_eur,
    },
    fee: facts.fee,
    ...(facts.withholding.isZero()
      ? {}
      : { withholding: convert(facts.withholding, facts.fx_rate, facts.fx_rate_date) }),
    cost_eur: gain.cost_eur,
    lots,
    own_eur: outcome.own_eur,
    released: outcome.released.map((release) => releaseLine(ctx, release)),
    released_eur: outcome.released_eur,
    deferred_eur: outcome.deferred_eur,
    ...(outcome.deferral === undefined ? {} : { deferral: deferralLine(ctx, outcome.deferral) }),
    computable_eur: outcome.computable_eur,
    computable_eur_rounded: outcome.computable_eur.roundToCents(),
    ...(outcome.provisional_until === undefined
      ? {}
      : { provisional_until: outcome.provisional_until }),
    criteria: sortCriteria(criteria),
  };
};

/** The criteria of an exchange difference: the method, the order of the lots, and what is not applied. */
const currencyCriteria = (gain: CurrencyGain): CriterionId[] =>
  sortCriteria([
    "4",
    "6",
    ...(gain.kind === "auto_conversion"
      ? (["4:auto_conversion"] as const)
      : (["4:currency_fifo"] as const)),
    ...(gain.gain_eur.isNegative() ? (["4:currency_wash_sale"] as const) : []),
  ]);

export const currencyLine = (ctx: LineContext, gain: CurrencyGain): CurrencyLine => {
  const lots = new Map(currencyLots(ctx.state).map((lot) => [lot.id, lot]));
  return {
    event_id: gain.event_id,
    kind: gain.kind,
    account_id: gain.account_id,
    currency: gain.currency,
    fiscal_date: gain.fiscal_date,
    amount: gain.amount,
    proceeds_eur: gain.proceeds_eur,
    cost_eur: gain.cost_eur,
    gain_eur: gain.gain_eur,
    gain_eur_rounded: gain.gain_eur_rounded,
    lots: gain.by_lot.map((slice) => ({
      lot_id: slice.lot_id,
      acquisition_date: (lots.get(slice.lot_id) as CurrencyLot).acquisition_date,
      amount: slice.amount,
      cost_eur: slice.cost_eur,
    })),
    criteria: currencyCriteria(gain),
  };
};

const incomeCriteria = (income: InvestmentIncome, rateDate: CivilDate): CriterionId[] =>
  sortCriteria(income.gross.currency !== EUR && rateDate < income.fiscal_date ? ["5", "6"] : ["6"]);

export const incomeLine = (ctx: LineContext, income: InvestmentIncome): IncomeLine => {
  const event = ctx.events.get(income.event_id) as DividendEvent;
  const country = income.kind === "dividend" ? event.source_country : undefined;
  return {
    event_id: income.event_id,
    kind: income.kind,
    account_id: income.account_id,
    ...(income.asset_id === undefined ? {} : { asset_id: income.asset_id }),
    fiscal_date: income.fiscal_date,
    gross: {
      amount: income.gross,
      fx_rate: event.fx_rate,
      fx_rate_date: event.fx_rate_date,
      eur: income.gross_eur,
    },
    gross_eur_rounded: income.gross_eur.roundToCents(),
    withholding_origin: income.withholding_origin,
    withholding_spain: income.withholding_spain,
    ...(country === undefined ? {} : { source_country: country }),
    criteria: incomeCriteria(income, event.fx_rate_date),
  };
};

/** Fee kinds whose amount is deducted from movable capital income (art. 26.1.a, #23). */
const DEDUCTIBLE_FEES = new Set(["custody", "administration"]);

/** Every deductible standalone fee of the ledger, in date order. */
export const expenseLines = (ctx: LineContext): ExpenseLine[] =>
  [...ctx.events.values()]
    .filter(
      (event): event is StandaloneFeeEvent =>
        event.type === "standalone_fee" &&
        DEDUCTIBLE_FEES.has(feeKindOf(event as StandaloneFeeEvent)),
    )
    .sort((a, b) => compareCivilDates(a.value_date, b.value_date))
    .map((event) => {
      const amount = convert(
        money(event.amount, event.currency),
        event.fx_rate,
        event.fx_rate_date,
      );
      return {
        event_id: event.id,
        account_id: event.account_id,
        fiscal_date: event.value_date,
        fee_kind: feeKindOf(event),
        amount,
        amount_eur_rounded: amount.eur.roundToCents().neg(),
        criteria: sortCriteria(
          event.currency !== EUR && event.fx_rate_date < event.value_date
            ? ["5", "6", "23"]
            : ["6", "23"],
        ),
      };
    });

export const withholdingLines = (
  transmissions: readonly TransmissionLine[],
  income: readonly IncomeLine[],
): WithholdingLine[] => {
  const lines: WithholdingLine[] = [];
  for (const line of transmissions) {
    const amount = line.withholding;
    if (amount === undefined) {
      continue;
    }
    lines.push({
      event_id: line.event_id,
      source: line.event_type === "sell" ? "sell" : "forced_sale",
      account_id: line.account_id,
      asset_id: line.asset_id,
      fiscal_date: line.fiscal_date,
      amount,
      amount_eur_rounded: amount.eur.roundToCents(),
      criteria: sortCriteria(["6", "12"]),
    });
  }
  for (const entry of income) {
    if (entry.withholding_spain.isZero()) {
      continue;
    }
    const amount = convert(entry.withholding_spain, entry.gross.fx_rate, entry.gross.fx_rate_date);
    lines.push({
      event_id: entry.event_id,
      source: entry.kind,
      account_id: entry.account_id,
      ...(entry.asset_id === undefined ? {} : { asset_id: entry.asset_id }),
      fiscal_date: entry.fiscal_date,
      amount,
      amount_eur_rounded: amount.eur.roundToCents(),
      criteria: sortCriteria(["6"]),
    });
  }
  return lines;
};
