// Small ledgers for the tax engine tests.

import { Money } from "../../src/money/money.js";
import type { RealizedGain } from "../../src/projections/state.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/settings.js";
import { boxesOf } from "../../src/tax/boxes/boxes.js";
import type { BoxEntry } from "../../src/tax/boxes/report.js";
import { categoryOf } from "../../src/tax/chain.js";
import type { TaxYearReport, TransmissionLine } from "../../src/tax/report.js";
import { taxYear, taxYearWithChain } from "../../src/tax/year.js";
import { LedgerBuilder } from "../ledger-builder.js";

export const text = (money: Money | undefined): string =>
  money === undefined ? "—" : money.amount.toString();

/**
 * The configuration a **hand calculation** is worked out with, written down in
 * full: the three families the engine reads, asset type by asset type, and the
 * four scalar criteria.
 *
 * `DEFAULT_SETTINGS` carries only the three families, and only as the code
 * believes them **today**; the four scalars are not in it at all and are read
 * from the documented defaults at the point of use. A ledger built on it
 * therefore borrows from the code every value the calculation depends on, and
 * a hand calculation whose literals move when a default moves is a mirror of
 * the engine, not a check on it. Measured: with the ledger on the defaults,
 * changing the income category of funds broke eight cases out of eight, and
 * lowering the offset limit from 25 % to 30 broke six.
 *
 * The model is `tests/fixtures/ledger/tax-hand-v1.jsonl`, which pins exactly
 * this and is immune to the same mutations. What the exercise of
 * `specs/010-tax-output/questions.md` §6.3 depends on it **names itself**: two
 * months for a listed security and the 25 % limit. The rest is written down at
 * the reading in force on 2026-09-22 so that nothing rides a default; the
 * exercise has no loss on a fund and no dividend, so those values do not enter
 * a single one of its literals.
 */
export const HAND_SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  fiscal_date_rule: {
    stock: "trade_date",
    etf: "trade_date",
    etc: "trade_date",
    etp: "trade_date",
    crypto: "trade_date",
    fund: "value_date",
    money_market: "value_date",
  },
  wash_sale_window: {
    stock: "2m",
    etf: "2m",
    etc: "2m",
    etp: "2m",
    crypto: "1y",
    fund: "2m",
    money_market: "2m",
  },
  income_category: {
    stock: "capital_gain",
    etf: "capital_gain",
    etc: "capital_gain",
    etp: "capital_gain",
    crypto: "capital_gain",
    fund: "capital_gain",
    money_market: "capital_gain",
  },
  wash_sale_transfer_counts: true,
  savings_offset_limit_pct: "25",
  loss_carryforward_years: 4,
  treaty_withholding_pct: { US: "15" },
};

/**
 * Core accounts and assets of every type the engine distinguishes. `null`
 * leaves the ledger without any `settings_changed`.
 *
 * The default is `DEFAULT_SETTINGS` on purpose: most tests here are **about**
 * what the documented defaults do, and pinning them would be the mirror the
 * other way round. A test whose literals are a calculation, not a reading of
 * the code, passes `HAND_SETTINGS`.
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

/**
 * The invariant of the rows by origin of the loss (ficha F5): the gains of the
 * form, less the losses it declares imputable, less what earlier years bring
 * into this one, is the balance of capital gains the engine computed.
 *
 * Checked on the **exact** amounts, before the rounding of each box: the
 * engine adds up one rounded figure per operation and the form adds up one per
 * row, and the two roundings are not the same arithmetic. What has to hold to
 * the last decimal is that the layout **moves** figures between rows and never
 * creates or loses one.
 */
export const rowsAddUpToTheEngine = (
  events: readonly LedgerEvent[],
  year: number,
  today = "2035-01-01",
): { rows: string; engine: string } => {
  const { report, chain } = taxYearWithChain(events, year, { today });
  const boxes = boxesOf(report, chain);
  const zero = Money.zero("EUR");
  const sumOf = (predicate: (entry: BoxEntry) => boolean): Money =>
    boxes.entries
      .filter((entry) => predicate(entry) && entry.exact_eur !== undefined)
      .reduce((total, entry) => total.add(entry.exact_eur as Money), zero);
  const rows = sumOf(
    (entry) =>
      entry.row !== undefined &&
      /^gp\.(iic|etf|listed_shares|crypto|other)\.(gain|loss_imputable)$/.test(entry.concept),
  ).add(sumOf((entry) => entry.concept === "gp.prior_years.loss"));
  // What the engine puts into the balance of capital gains: what each disposal
  // of the category computes, plus every release of a loss of this category
  // that happened on a disposal of the other one.
  const foreign = chain.walk.outcomes
    .filter((outcome) => (chain.state.gains[outcome.gain_index] as RealizedGain).year === year)
    .flatMap((outcome) => outcome.foreign_released)
    .filter(
      (release) =>
        categoryOf(chain.state, (chain.state.gains[release.origin] as RealizedGain).asset_id) ===
        "capital_gain",
    )
    .reduce((total, release) => total.add(release.amount_eur), zero);
  const engine = report.capital_gains.lines
    .reduce((total, line) => total.add(line.computable_eur), zero)
    .add(foreign);
  return { rows: rows.amount.toString(), engine: engine.amount.toString() };
};
