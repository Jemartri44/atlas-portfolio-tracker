// Ledgers for the tests of the sync clients: a minimal builder over the public
// API of the domain (the domain's own test builder is not a package export).
// Each device builds with an id sequence of its own, so two devices never
// collide; every event is encoded as the application writes it.

import {
  DEFAULT_SETTINGS,
  encodeLine,
  fingerprintOf,
  fingerprintOfEvents,
  type LedgerEvent,
  type Settings,
} from "@atlas/domain";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const idOf = (sequence: number): string => {
  let remaining = sequence;
  let suffix = "";
  for (let i = 0; i < 5; i += 1) {
    suffix = ALPHABET.charAt(remaining % 32) + suffix;
    remaining = Math.floor(remaining / 32);
  }
  return `01ARYZ6S41TSV4RRFFQ69${suffix}`;
};

type Fields = Record<string, unknown>;

export class Builder {
  private sequence: number;
  private day = "2027-08-01";
  readonly events: LedgerEvent[] = [];

  constructor(start = 0) {
    this.sequence = start;
  }

  recordedOn(day: string): this {
    this.day = day;
    return this;
  }

  event(type: string, fields: Fields, keepFingerprint = false): LedgerEvent {
    const sequence = this.sequence;
    this.sequence += 1;
    const seconds = String(sequence % 60).padStart(2, "0");
    const minutes = String(Math.floor(sequence / 60) % 60).padStart(2, "0");
    const draft = {
      schema_version: 1,
      id: idOf(sequence),
      recorded_at: `${this.day}T08:${minutes}:${seconds}.000Z`,
      type,
      ...fields,
    } as unknown as LedgerEvent;
    const fingerprint = keepFingerprint ? undefined : fingerprintOf(draft as never);
    const event = (fingerprint === undefined ? draft : { ...draft, fingerprint }) as LedgerEvent;
    this.events.push(event);
    return event;
  }

  account(account_id: string): LedgerEvent {
    return this.event("account_created", {
      account_id,
      name: account_id,
      platform: "test",
      book: "core",
      base_currency: "EUR",
      country: "ES",
      active: true,
    });
  }

  asset(asset_id: string, extra: Fields = {}): LedgerEvent {
    return this.event("asset_created", {
      asset_id,
      asset_type: "fund",
      book: "core",
      asset_class: "equity",
      name: asset_id,
      currency: "EUR",
      transferable: true,
      active: true,
      ...extra,
    });
  }

  assetUpdated(asset_id: string, name: string): LedgerEvent {
    return this.event("asset_updated", {
      asset_id,
      asset_type: "fund",
      book: "core",
      asset_class: "equity",
      name,
      currency: "EUR",
      transferable: true,
      active: true,
    });
  }

  settings(settings: Settings = DEFAULT_SETTINGS): LedgerEvent {
    return this.event("settings_changed", { settings });
  }

  trade(
    type: "buy" | "sell",
    quantity: string,
    date = "2027-01-11",
    extra: Fields = {},
  ): LedgerEvent {
    return this.event(type, {
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: date,
      value_date: date,
      quantity,
      unit_price: "100",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: date,
      fee: "0",
      source: "manual",
      ...extra,
    });
  }

  deposit(amount: string, date = "2027-01-11"): LedgerEvent {
    return this.event("cash_deposit", {
      account_id: "acc_fund",
      value_date: date,
      amount,
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: date,
    });
  }

  reversal(target: LedgerEvent): LedgerEvent {
    return this.event("reversal", { reverses_id: target.id, reason: "typo" });
  }

  /** The reversal of `original` and its correction, as `correctEvent` writes them. */
  correction(original: LedgerEvent, changes: Fields): [LedgerEvent, LedgerEvent] {
    const reversal = this.reversal(original);
    const {
      schema_version: _v,
      id: _i,
      recorded_at: _r,
      type,
      fingerprint: _f,
      ...fields
    } = original as LedgerEvent & { fingerprint?: string };
    const corrected = this.event(type, { corrects_id: original.id, ...fields, ...changes });
    return [reversal, corrected];
  }

  /** A filed return sealed over `prefix`, recorded after it was filed. */
  filed(year: number, prefix: readonly LedgerEvent[]): LedgerEvent {
    const filed_at = `${year + 1}-06-18`;
    const before = this.day;
    this.day = filed_at;
    const declared = { savings_base_eur: "0", pending_losses: [], deferred_losses_eur: "0" };
    const event = this.event("tax_return_filed", {
      model: "renta",
      tax_year: year,
      filed_at,
      receipt_reference: `renta-${year}-000000000000`,
      declared,
      computed: {
        ...declared,
        as_of: filed_at,
        settings_origin: "default",
        settings: DEFAULT_SETTINGS,
      },
      ledger_fingerprint: fingerprintOfEvents(prefix),
    });
    this.day = before;
    return event;
  }
}

/** The catalogue both devices start from, and a buy of 10. */
export const base = (): LedgerEvent[] => {
  const b = new Builder(0);
  b.account("acc_fund");
  b.asset("ast_world");
  b.asset("ast_bonds", { asset_class: "fixed_income" });
  b.trade("buy", "10");
  return b.events;
};

export const linesOf = (events: readonly LedgerEvent[]): string[] => events.map(encodeLine);
export const textOf = (events: readonly LedgerEvent[]): string =>
  events.map((event) => `${encodeLine(event)}\n`).join("");
