import { Money } from "../../src/money/money.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { type Settings } from "../../src/settings/settings.js";
import type { TaxYearReport, TransmissionLine } from "../../src/tax/report.js";
import { LedgerBuilder } from "../ledger-builder.js";
export declare const text: (money: Money | undefined) => string;
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
export declare const HAND_SETTINGS: Settings;
/**
 * Core accounts and assets of every type the engine distinguishes. `null`
 * leaves the ledger without any `settings_changed`.
 *
 * The default is `DEFAULT_SETTINGS` on purpose: most tests here are **about**
 * what the documented defaults do, and pinning them would be the mirror the
 * other way round. A test whose literals are a calculation, not a reading of
 * the code, passes `HAND_SETTINGS`.
 */
export declare const taxBuilder: (settings?: Settings | null) => LedgerBuilder;
export declare const reportOf: (
  events: readonly LedgerEvent[],
  year: number,
  today?: string,
) => TaxYearReport;
export declare const lineOf: (
  report: TaxYearReport,
  eventId: string,
  account?: string,
) => TransmissionLine;
/** A buy of `quantity` at `price` (EUR) in acc_a on `date`. */
export declare const buy: (
  b: LedgerBuilder,
  asset: string,
  date: string,
  quantity: string,
  price: string,
) => import("../../src/schema/events.js").BuyEvent;
export declare const sell: (
  b: LedgerBuilder,
  asset: string,
  date: string,
  quantity: string,
  price: string,
) => import("../../src/schema/events.js").SellEvent;
export declare const transfer: (
  b: LedgerBuilder,
  from: string,
  to: string,
  date: string,
  quantityOut: string,
  quantityIn: string,
) => import("../../src/schema/events.js").TransferEvent;
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
export declare const rowsAddUpToTheEngine: (
  events: readonly LedgerEvent[],
  year: number,
  today?: string,
) => {
  rows: string;
  engine: string;
};
//# sourceMappingURL=helpers.d.ts.map
