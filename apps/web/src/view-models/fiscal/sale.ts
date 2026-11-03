// "¿Y si vendo?" and "No recomprar hasta", turned into what their cards paint.
// Every figure is the domain's (`simulateSale`, `repurchaseCalendar`); this
// layer names assets and accounts and dates the rows.

import type { Money, Quantity } from "@atlas/domain";
import type { RepurchaseCalendar, SaleSimulation } from "@atlas/domain/fiscal";
import type { PriceInfo } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import type { NameIndex } from "../../format/names.js";
import { displayName } from "../../format/names.js";
import { priceFieldsOf } from "../price-info.js";

export interface SaleOrderView {
  key: string;
  account: string;
  quantity: Quantity;
  amount_eur: Money;
  /** Unknown, never zero, when the ledger has no equivalent sale. */
  fee_eur?: Money;
}

export interface SaleLotView {
  key: string;
  acquired: string;
  quantity: Quantity;
  cost_eur: Money;
  gain_eur: Money;
}

export interface SaleView {
  name: string;
  quantity: Quantity;
  price: PriceInfo;
  orders: SaleOrderView[];
  lots: SaleLotView[];
  gain_eur: Money;
  /** What the sale adds to the quota; absent when it saves tax instead. */
  tax_eur?: Money;
  /** What a loss takes off the quota of the year, as a positive amount. */
  saving_eur?: Money;
  deferred_eur?: Money;
  deferral_until?: string;
  repurchase_until?: string;
}

export const saleView = (sale: SaleSimulation, names: NameIndex): SaleView => ({
  name: displayName(names, sale.asset_id),
  quantity: sale.quantity,
  price: priceFieldsOf(sale.price),
  orders: sale.orders.map((order) => ({
    key: order.account_id,
    account: displayName(names, order.account_id),
    quantity: order.quantity,
    amount_eur: order.amount_eur,
    ...(order.fee === undefined ? {} : { fee_eur: order.fee.fee_eur }),
  })),
  lots: sale.lots.map((lot) => ({
    key: lot.lot_id,
    acquired: formatDate(lot.acquisition_date),
    quantity: lot.quantity,
    cost_eur: lot.cost_eur,
    gain_eur: lot.gain_eur,
  })),
  gain_eur: sale.gain_eur,
  ...(sale.tax_eur.isNegative() ? { saving_eur: sale.tax_eur.neg() } : { tax_eur: sale.tax_eur }),
  ...(sale.deferred_eur.isZero() ? {} : { deferred_eur: sale.deferred_eur }),
  ...(sale.deferral_window_end === undefined
    ? {}
    : { deferral_until: formatDate(sale.deferral_window_end) }),
  ...(sale.repurchase_until === undefined
    ? {}
    : { repurchase_until: formatDate(sale.repurchase_until) }),
});

export interface RepurchaseRow {
  key: string;
  name: string;
  until: string;
  at_stake_eur: Money;
  /** "2 ventas con pérdida": only when there is more than one. */
  sales?: string;
}

export interface RepurchaseView {
  rows: RepurchaseRow[];
  transferInCounts: boolean;
}

export const repurchaseView = (calendar: RepurchaseCalendar, names: NameIndex): RepurchaseView => ({
  rows: calendar.blocks.map((block) => ({
    key: block.asset_id,
    name: displayName(names, block.asset_id),
    until: formatDate(block.until),
    at_stake_eur: block.at_stake_eur,
    ...(block.sales.length > 1 ? { sales: `${block.sales.length} ventas con pérdida` } : {}),
  })),
  transferInCounts: calendar.transfer_in_counts,
});
