// The rebalance proposal, as steps (feature 028).
//
// `rebalancePlan` decides everything — what moves, in which order, what each
// step leaves, the estimated tax; nothing is recomputed here. What this adds
// are the names and the sentence of each case.

import type { Money, Quantity, Warning } from "@atlas/domain";
import type { RebalancePlan, RebalanceStep, SaleTax } from "@atlas/domain/rebalance";
import { formatDate } from "../../format/date.js";
import { valueLabel } from "../../format/labels.js";
import { displayName, type NameIndex, NO_NAMES } from "../../format/names.js";
import { type PlatformsView, platformsView } from "./platforms.js";

export interface DiagnosisRowView {
  assetId: string;
  name: string;
  assetClass: string;
  value: Money;
  weightPct: string;
  targetPct: string;
  deviationPp: string;
  beyondThreshold: boolean;
}

/** The tax of a sale, said the way it is asked: what is known, what is not. */
export type SaleTaxView =
  | { kind: "unavailable"; code: string }
  | {
      kind: "estimated";
      /** Absent when the brackets are not configured, or when the sale saves tax instead (`saving`). */
      tax?: Money;
      /** A loss that offsets gains already made this year: how much tax it takes off. */
      saving?: Money;
      gain: Money;
      isLoss: boolean;
      lots: { acquired: string; quantity: Quantity; cost: Money; gain: Money }[];
      deferred?: { amount: Money; until: string };
    };

interface StepBase {
  index: number;
  /** Where the core stands if the plan stops at this step, in points. */
  maxDeviationPp: string;
}

export type StepView =
  | (StepBase & { kind: "contribution"; amount: Money; platforms: PlatformsView })
  | (StepBase & {
      kind: "transfer";
      fromName: string;
      toName: string;
      amount: Money;
      quantity: Quantity;
      fromAccount?: string;
      toAccount?: string;
    })
  | (StepBase & {
      kind: "sale";
      name: string;
      amount: Money;
      orders: {
        accountId: string;
        quantity: Quantity;
        amount: Money;
        fee?: Money;
        feePct?: string;
      }[];
      tax: SaleTaxView;
      buys: PlatformsView;
    });

export interface CashMoveView {
  accountId: string;
  platform: string;
  buy: Money;
  sell: Money;
  fees: Money;
  net: Money;
}

export interface RebalanceView {
  date: string;
  thresholdPp: string;
  newMoney: Money;
  status: RebalancePlan["status"];
  /** New money purchases alone would still need; only said when something is under its target. */
  purchasesOnly?: Money;
  diagnosis: DiagnosisRowView[];
  steps: StepView[];
  cash: CashMoveView[];
  warnings: readonly Warning[];
}

const taxView = (tax: SaleTax): SaleTaxView =>
  tax.available
    ? {
        kind: "estimated",
        ...(tax.tax_eur === undefined || tax.tax_eur.isNegative() ? {} : { tax: tax.tax_eur }),
        ...(tax.tax_eur?.isNegative() === true ? { saving: tax.tax_eur.neg() } : {}),
        gain: tax.gain_eur,
        isLoss: tax.gain_eur.isNegative(),
        lots: tax.lots.map((lot) => ({
          acquired: formatDate(lot.acquisition_date),
          quantity: lot.quantity,
          cost: lot.cost_eur,
          gain: lot.gain_eur,
        })),
        ...(tax.deferred_eur.isZero()
          ? {}
          : {
              deferred: {
                amount: tax.deferred_eur,
                until:
                  tax.deferral_window_end === undefined ? "" : formatDate(tax.deferral_window_end),
              },
            }),
      }
    : { kind: "unavailable", code: tax.code };

const stepView = (step: RebalanceStep, position: number, names: NameIndex): StepView => {
  const base = { index: position + 1, maxDeviationPp: step.outcome.max_deviation_pp.toString() };
  switch (step.kind) {
    case "contribution":
      return {
        ...base,
        kind: "contribution" as const,
        amount: step.amount_eur,
        platforms: platformsView(step.platforms, names),
      };
    case "transfer":
      return {
        ...base,
        kind: "transfer" as const,
        fromName: displayName(names, step.from_asset_id),
        toName: displayName(names, step.to_asset_id),
        amount: step.amount_eur,
        quantity: step.quantity,
        ...(step.from_account_id === undefined ? {} : { fromAccount: step.from_account_id }),
        ...(step.to_account_id === undefined ? {} : { toAccount: step.to_account_id }),
      };
    case "sale":
      return {
        ...base,
        kind: "sale" as const,
        name: displayName(names, step.asset_id),
        amount: step.amount_eur,
        orders: step.orders.map((order) => ({
          accountId: order.account_id,
          quantity: order.quantity,
          amount: order.amount_eur,
          ...(order.fee === undefined ? {} : { fee: order.fee.fee_eur }),
          ...(order.fee_pct === undefined ? {} : { feePct: order.fee_pct.toString() }),
        })),
        tax: taxView(step.tax),
        buys: platformsView(step.buys, names),
      };
  }
};

export const rebalanceView = (plan: RebalancePlan, names: NameIndex = NO_NAMES): RebalanceView => ({
  date: plan.date,
  thresholdPp: plan.threshold_pp.toString(),
  newMoney: plan.new_money_eur,
  status: plan.status,
  ...(plan.purchases_only_eur.amount.isPositive()
    ? { purchasesOnly: plan.purchases_only_eur }
    : {}),
  diagnosis: plan.diagnosis.map((row) => ({
    assetId: row.asset_id,
    name: displayName(names, row.asset_id),
    assetClass: valueLabel(row.asset_class),
    value: row.value_eur,
    weightPct: row.weight_pct.toString(),
    targetPct: row.target_pct.toString(),
    deviationPp: row.deviation_pp.toString(),
    beyondThreshold: row.beyond_threshold,
  })),
  steps: plan.steps.map((step, position) => stepView(step, position, names)),
  cash: plan.cash.map((move) => ({
    accountId: move.account_id,
    platform: move.platform,
    buy: move.buy_eur,
    sell: move.sell_eur,
    fees: move.fees_eur,
    net: move.net_eur,
  })),
  warnings: plan.warnings,
});
