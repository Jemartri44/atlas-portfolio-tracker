// Small ledgers for the tax engine tests.

import type { Money } from "../../src/money/money.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/settings.js";
import type { TaxYearReport, TransmissionLine } from "../../src/tax/report.js";
import { taxYear } from "../../src/tax/year.js";
import { LedgerBuilder } from "../ledger-builder.js";

export const text = (money: Money | undefined): string =>
  money === undefined ? "—" : money.amount.toString();

/**
 * Core accounts and assets of every type the engine distinguishes. `null`
 * leaves the ledger without any `settings_changed`.
 */
export const taxBuilder = (settings: Settings | null = DEFAULT_SETTINGS): LedgerBuilder => {
  const b = new LedgerBuilder();
  if (settings !== null) {
    b.settings(settings);
  }
  b.account("acc_a");
  b.account("acc_b", { platform: "ibkr", country: "IE" });
  b.asset("fund_f");
  b.asset("fund_g");
  b.asset("fund_h");
  b.asset("fund_i");
  b.asset("stock_s", { asset_type: "stock", transferable: false });
  b.asset("stock_t", { asset_type: "stock", transferable: false });
  b.asset("etc_e", { asset_type: "etc", asset_class: "gold", transferable: false });
  b.asset("coin_c", { asset_type: "crypto", asset_class: "crypto", transferable: false });
  b.asset("coin_d", { asset_type: "crypto", asset_class: "crypto", transferable: false });
  return b;
};

export const reportOf = (
  events: readonly LedgerEvent[],
  year: number,
  today = "2035-01-01",
): TaxYearReport => taxYear(events, year, { today });

export const lineOf = (
  report: TaxYearReport,
  eventId: string,
  account?: string,
): TransmissionLine => {
  const line = [...report.capital_gains.lines, ...report.movable_capital.transmissions].find(
    (entry) =>
      entry.event_id === eventId && (account === undefined || entry.account_id === account),
  );
  if (line === undefined) {
    throw new Error(`no line for ${eventId}`);
  }
  return line;
};

/** A buy of `quantity` at `price` (EUR) in acc_a on `date`. */
export const buy = (
  b: LedgerBuilder,
  asset: string,
  date: string,
  quantity: string,
  price: string,
) => b.buy({ account_id: "acc_a", asset_id: asset, value_date: date, quantity, unit_price: price });

export const sell = (
  b: LedgerBuilder,
  asset: string,
  date: string,
  quantity: string,
  price: string,
) =>
  b.sell({ account_id: "acc_a", asset_id: asset, value_date: date, quantity, unit_price: price });

export const transfer = (
  b: LedgerBuilder,
  from: string,
  to: string,
  date: string,
  quantityOut: string,
  quantityIn: string,
) =>
  b.transfer({
    from_account_id: "acc_a",
    from_asset_id: from,
    quantity_out: quantityOut,
    value_date_out: date,
    to_account_id: "acc_a",
    to_asset_id: to,
    quantity_in: quantityIn,
    value_date_in: date,
  });
