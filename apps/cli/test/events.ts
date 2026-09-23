// A small ledger written by hand for the CLI tests.
//
// The domain has a richer builder, and it lives in `packages/domain/test`,
// which this package cannot reach: `tsc -b` builds each workspace against its
// own `rootDir`, and a test file that crosses the boundary breaks the build
// even though vitest resolves it. So this is the little of it the console tests
// need — the catalogue, a deposit, a purchase, a sale and a valuation — with
// every field written out.

import { type LedgerEvent, lastWorkingDay, type Settings } from "@atlas/domain";

/**
 * The configuration a **hand calculation** is worked out with, written down in
 * full: a figure that borrows a default from the code stops checking it.
 */
export const CLI_SETTINGS: Settings = {
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
    etc: "movable_capital",
    etp: "movable_capital",
    crypto: "capital_gain",
    fund: "capital_gain",
    money_market: "capital_gain",
  },
  wash_sale_transfer_counts: true,
  savings_offset_limit_pct: "25",
  loss_carryforward_years: 4,
  treaty_withholding_pct: { US: "15" },
  model_720_threshold_eur: "50000",
  model_720_increase_eur: "20000",
  model_720_alert_threshold_eur: "45000",
  model_721_threshold_eur: "50000",
  model_721_increase_eur: "20000",
  model_721_alert_threshold_eur: "45000",
  renta_season_start: "04-01",
  renta_season_end: "06-30",
};

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export class Events {
  private readonly events: LedgerEvent[] = [];
  private sequence = 0;

  private envelope(type: string, recordedOn = "2026-09-01"): Record<string, unknown> {
    const n = this.sequence;
    this.sequence += 1;
    const suffix = `${CROCKFORD[Math.floor(n / 32) % 32]}${CROCKFORD[n % 32]}`;
    return {
      schema_version: 1,
      id: `01ARYZ6S41TSV4RRFFQ69000${suffix}`,
      recorded_at: `${recordedOn}T18:00:${String(n % 60).padStart(2, "0")}.000Z`,
      type,
    };
  }

  private push(type: string, fields: Record<string, unknown>, recordedOn?: string): LedgerEvent {
    const event = {
      ...this.envelope(type, recordedOn),
      ...fields,
      fingerprint: `sha256:${type}${this.sequence}`,
    } as unknown as LedgerEvent;
    this.events.push(event);
    return event;
  }

  build(): LedgerEvent[] {
    return [...this.events];
  }

  settings(settings: Settings = CLI_SETTINGS): LedgerEvent {
    return this.push("settings_changed", { settings });
  }

  account(account_id: string, country = "ES", book = "core"): LedgerEvent {
    return this.push("account_created", {
      account_id,
      name: account_id,
      platform: "test",
      book,
      base_currency: "EUR",
      country,
      active: true,
    });
  }

  asset(asset_id: string, asset_type = "fund", book = "core"): LedgerEvent {
    return this.push("asset_created", {
      asset_id,
      asset_type,
      book,
      name: asset_id,
      currency: "EUR",
      active: true,
      transferable: asset_type === "fund",
      asset_class:
        asset_type === "crypto" || asset_type === "etp"
          ? "crypto"
          : asset_type === "etc"
            ? "gold"
            : "equity",
    });
  }

  deposit(account_id: string, value_date: string, amount: string): LedgerEvent {
    return this.push("cash_deposit", {
      account_id,
      value_date,
      amount,
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: lastWorkingDay(value_date),
    });
  }

  buy(
    account_id: string,
    asset_id: string,
    value_date: string,
    quantity: string,
    unit_price: string,
  ): LedgerEvent {
    return this.push("buy", {
      account_id,
      asset_id,
      trade_date: value_date,
      value_date,
      quantity,
      unit_price,
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: lastWorkingDay(value_date),
      fee: "0",
      source: "manual",
    });
  }

  sell(
    account_id: string,
    asset_id: string,
    value_date: string,
    quantity: string,
    unit_price: string,
    /** Defaults to the value date; the two only differ when the test needs them to. */
    trade_date = value_date,
  ): LedgerEvent {
    return this.push("sell", {
      account_id,
      asset_id,
      trade_date,
      value_date,
      quantity,
      unit_price,
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: lastWorkingDay(value_date),
      fee: "0",
      source: "manual",
    });
  }

  valuation(
    account_id: string,
    asset_id: string,
    date: string,
    quantity: string,
    unit_value: string,
  ): LedgerEvent {
    return this.push("valuation", {
      account_id,
      asset_id,
      date,
      quantity,
      unit_value,
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: lastWorkingDay(date),
      source: "manual",
    });
  }

  filed(fields: Record<string, unknown>, recordedOn: string): LedgerEvent {
    return this.push("tax_return_filed", fields, recordedOn);
  }
}
