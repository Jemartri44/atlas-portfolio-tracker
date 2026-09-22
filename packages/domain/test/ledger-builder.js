// Builds synthetic ledgers for tests: sequential ULID-shaped ids, computed
// fingerprints and sensible defaults for every event type.
import { lastWorkingDay } from "../src/dates/civil-date.js";
import { fingerprintOf } from "../src/schema/fingerprint.js";
import { DEFAULT_SETTINGS } from "../src/settings/settings.js";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PREFIX = "01ARYZ6S41TSV4RRFFQ69";
export const idOf = (sequence) => {
  let remaining = sequence;
  let suffix = "";
  for (let i = 0; i < 5; i += 1) {
    suffix = ALPHABET.charAt(remaining % 32) + suffix;
    remaining = Math.floor(remaining / 32);
  }
  return PREFIX + suffix;
};
export class LedgerBuilder {
  events = [];
  sequence;
  recordedOn = "2026-09-01";
  /** `start` offsets the id sequence so two builders can extend the same ledger without colliding. */
  constructor(start = 0) {
    this.sequence = start;
  }
  /**
   * Moves the administrative clock: what follows is recorded on that day. Only
   * theses read it (`opened_at` and `closed_at` come from `recorded_at`);
   * everything else is dated by its own business fields.
   */
  recordedAt(date) {
    this.recordedOn = date;
  }
  envelope(type) {
    const sequence = this.sequence;
    this.sequence += 1;
    const seconds = String(sequence % 60).padStart(2, "0");
    const minutes = String(Math.floor(sequence / 60) % 60).padStart(2, "0");
    return {
      schema_version: 1,
      id: idOf(sequence),
      recorded_at: `${this.recordedOn}T18:${minutes}:${seconds}.000Z`,
      type,
    };
  }
  push(type, fields) {
    const draft = { ...this.envelope(type), ...fields };
    const fingerprint = fingerprintOf(draft);
    const event = fingerprint === undefined ? draft : { ...draft, fingerprint };
    if ("fingerprint" in fields && fields.fingerprint !== undefined) {
      event.fingerprint = fields.fingerprint;
    }
    this.events.push(event);
    return event;
  }
  raw(event) {
    this.events.push(event);
    return event;
  }
  nextEnvelope(type) {
    return this.envelope(type);
  }
  build() {
    return [...this.events];
  }
  account(account_id, overrides = {}) {
    return this.push("account_created", {
      account_id,
      name: account_id,
      platform: "test",
      book: "core",
      base_currency: "EUR",
      country: "ES",
      active: true,
      ...overrides,
    });
  }
  accountUpdated(fields) {
    return this.push("account_updated", fields);
  }
  asset(asset_id, overrides = {}) {
    const book = overrides.book ?? "core";
    return this.push("asset_created", {
      asset_id,
      asset_type: "fund",
      book,
      ...(book === "core" ? { asset_class: "equity" } : {}),
      name: asset_id,
      currency: "EUR",
      transferable: true,
      active: true,
      ...overrides,
    });
  }
  assetUpdated(fields) {
    return this.push("asset_updated", fields);
  }
  settings(settings) {
    return this.push("settings_changed", { settings });
  }
  buy(overrides) {
    const value_date = overrides.value_date ?? overrides.trade_date ?? "2027-01-11";
    return this.push("buy", {
      trade_date: value_date,
      value_date,
      quantity: "10",
      unit_price: "100",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: lastWorkingDay(value_date),
      fee: "0",
      source: "manual",
      ...overrides,
    });
  }
  sell(overrides) {
    const value_date = overrides.value_date ?? overrides.trade_date ?? "2027-06-10";
    return this.push("sell", {
      trade_date: value_date,
      value_date,
      quantity: "1",
      unit_price: "100",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: lastWorkingDay(value_date),
      fee: "0",
      source: "manual",
      ...overrides,
    });
  }
  swap(overrides) {
    const value_date = overrides.value_date ?? overrides.trade_date ?? "2027-06-10";
    return this.push("swap", {
      trade_date: value_date,
      value_date,
      quantity_out: "1",
      market_value_out: "100",
      quantity_in: "1",
      market_value_in: "100",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: lastWorkingDay(value_date),
      fee: "0",
      source: "manual",
      ...overrides,
    });
  }
  transfer(fields) {
    return this.push("transfer", fields);
  }
  dividend(overrides) {
    return this.push("dividend", {
      value_date: "2027-04-01",
      gross: "10",
      withholding_origin: "0",
      withholding_spain: "0",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2027-04-01",
      ...overrides,
    });
  }
  interest(overrides) {
    return this.push("interest", {
      value_date: "2027-04-30",
      gross: "5",
      withholding_spain: "0",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2027-04-30",
      ...overrides,
    });
  }
  fx(overrides) {
    return this.push("fx_exchange", {
      value_date: "2027-05-04",
      sold_amount: "1085",
      sold_currency: "EUR",
      bought_amount: "1170",
      bought_currency: "USD",
      fee: "2",
      fee_currency: "USD",
      fx_rate_sold: "1",
      fx_rate_bought: "1.0783",
      fx_rate_date: "2027-05-04",
      ...overrides,
    });
  }
  deposit(overrides) {
    const value_date = overrides.value_date ?? "2026-08-31";
    return this.push("cash_deposit", {
      value_date,
      amount: "5000",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: lastWorkingDay(value_date),
      ...overrides,
    });
  }
  withdrawal(overrides) {
    const value_date = overrides.value_date ?? "2027-06-01";
    return this.push("cash_withdrawal", {
      value_date,
      amount: "100",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: lastWorkingDay(value_date),
      ...overrides,
    });
  }
  fee(overrides) {
    const value_date = overrides.value_date ?? "2027-06-30";
    return this.push("standalone_fee", {
      value_date,
      amount: "3",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: lastWorkingDay(value_date),
      description: "custody",
      ...overrides,
    });
  }
  valuation(overrides) {
    const date = overrides.date ?? "2026-12-31";
    return this.push("valuation", {
      date,
      quantity: "5",
      unit_value: "210",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: lastWorkingDay(date),
      source: "manual",
      ...overrides,
    });
  }
  orderPlaced(overrides) {
    return this.push("order_placed", {
      side: "buy",
      ...(overrides.quantity === undefined ? { amount: "500" } : {}),
      requested_date: "2027-07-01",
      ...overrides,
    });
  }
  orderUpdated(fields) {
    return this.push("order_updated", fields);
  }
  transferRequested(fields) {
    return this.push("transfer_requested", fields);
  }
  transferRequestUpdated(fields) {
    return this.push("transfer_request_updated", fields);
  }
  reversal(reverses_id, reason = "test") {
    return this.push("reversal", { reverses_id, reason });
  }
  corporateAction(overrides) {
    return this.push("corporate_action", {
      effective_date: "2027-03-01",
      source_document: "https://issuer.example/notice.pdf",
      ...overrides,
    });
  }
  thesisOpened(overrides) {
    return this.push("thesis_opened", {
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      hypothesis: "test hypothesis",
      expected_horizon_days: 90,
      invalidation: "test invalidation",
      planned_size_eur: "500",
      ...overrides,
    });
  }
  thesisClosed(thesis_id, closing_notes = "closed") {
    return this.push("thesis_closed", { thesis_id, closing_notes });
  }
  /**
   * A filed return (ADR-0020). Defaults to a `renta` that declares nothing, so
   * a test only writes the figures it is about. The administrative clock moves
   * to the day it was filed, because `filed_at` may not be after the day the
   * event was recorded.
   */
  filed(overrides) {
    const model = overrides.model ?? "renta";
    const filed_at = overrides.filed_at ?? `${overrides.tax_year + 1}-06-18`;
    const nothing =
      model === "renta"
        ? { savings_base_eur: "0", pending_losses: [], deferred_losses_eur: "0" }
        : { items: [] };
    const declared = overrides.declared ?? nothing;
    const before = this.recordedOn;
    this.recordedAt(filed_at);
    const event = this.push("tax_return_filed", {
      model,
      filed_at,
      receipt_reference: `${model}-${String(overrides.tax_year)}-000000000000`,
      declared,
      computed: {
        as_of: filed_at,
        settings_origin: "default",
        settings: DEFAULT_SETTINGS,
        ...(overrides.computed ?? declared),
      },
      ledger_fingerprint: {
        schema_version: 1,
        lines: this.events.length,
        sha256: "0".repeat(64),
      },
      ...overrides,
    });
    this.recordedAt(before);
    return event;
  }
}
/** Catalogue shared by most projection tests: two core accounts, one bucket account, three assets. */
export const catalogue = (builder) => {
  builder.account("acc_fund");
  builder.account("acc_etf", { platform: "ibkr", country: "IE" });
  builder.account("acc_bucket", { platform: "ibkr", book: "bucket", country: "IE" });
  builder.asset("ast_world");
  builder.asset("ast_bonds", { asset_class: "fixed_income" });
  builder.asset("ast_gold", {
    asset_type: "etc",
    asset_class: "gold",
    currency: "USD",
    transferable: false,
  });
  builder.asset("ast_spec", {
    asset_type: "stock",
    book: "bucket",
    currency: "USD",
    transferable: false,
  });
};
//# sourceMappingURL=ledger-builder.js.map
