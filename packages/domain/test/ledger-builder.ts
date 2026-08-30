// Builds synthetic ledgers for tests: sequential ULID-shaped ids, computed
// fingerprints and sensible defaults for every event type.

import type { Ulid } from "../src/ids/ulid.js";
import type { Envelope } from "../src/schema/envelope.js";
import type {
  AccountCreatedEvent,
  AccountUpdatedEvent,
  AssetCreatedEvent,
  AssetUpdatedEvent,
  BuyEvent,
  CashDepositEvent,
  CashWithdrawalEvent,
  CorporateActionEvent,
  DividendEvent,
  FxExchangeEvent,
  InterestEvent,
  LedgerEvent,
  OrderPlacedEvent,
  OrderUpdatedEvent,
  ReversalEvent,
  SellEvent,
  SettingsChangedEvent,
  StandaloneFeeEvent,
  SupportedEvent,
  ThesisClosedEvent,
  ThesisOpenedEvent,
  TransferEvent,
  TransferRequestedEvent,
  TransferRequestUpdatedEvent,
  ValuationEvent,
} from "../src/schema/events.js";
import { fingerprintOf } from "../src/schema/fingerprint.js";
import type { Settings } from "../src/settings/settings.js";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PREFIX = "01ARYZ6S41TSV4RRFFQ69";

export const idOf = (sequence: number): Ulid => {
  let remaining = sequence;
  let suffix = "";
  for (let i = 0; i < 5; i += 1) {
    suffix = ALPHABET.charAt(remaining % 32) + suffix;
    remaining = Math.floor(remaining / 32);
  }
  return PREFIX + suffix;
};

type Fields<E extends SupportedEvent> = Omit<E, keyof Envelope | "fingerprint"> & {
  fingerprint?: string;
};

export class LedgerBuilder {
  private readonly events: LedgerEvent[] = [];
  private sequence = 0;

  private envelope(type: LedgerEvent["type"]): Envelope {
    const sequence = this.sequence;
    this.sequence += 1;
    const seconds = String(sequence % 60).padStart(2, "0");
    const minutes = String(Math.floor(sequence / 60) % 60).padStart(2, "0");
    return {
      schema_version: 1,
      id: idOf(sequence),
      recorded_at: `2026-09-01T18:${minutes}:${seconds}.000Z`,
      type,
    };
  }

  private push<E extends SupportedEvent>(type: E["type"], fields: Fields<E>): E {
    const draft = { ...this.envelope(type), ...fields } as unknown as E;
    const fingerprint = fingerprintOf(draft);
    const event = (fingerprint === undefined ? draft : { ...draft, fingerprint }) as E;
    if ("fingerprint" in fields && fields.fingerprint !== undefined) {
      (event as { fingerprint: string }).fingerprint = fields.fingerprint;
    }
    this.events.push(event);
    return event;
  }

  raw(event: LedgerEvent): LedgerEvent {
    this.events.push(event);
    return event;
  }

  nextEnvelope(type: LedgerEvent["type"]): Envelope {
    return this.envelope(type);
  }

  build(): LedgerEvent[] {
    return [...this.events];
  }

  account(
    account_id: string,
    overrides: Partial<Fields<AccountCreatedEvent>> = {},
  ): AccountCreatedEvent {
    return this.push<AccountCreatedEvent>("account_created", {
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

  accountUpdated(fields: Fields<AccountUpdatedEvent>): AccountUpdatedEvent {
    return this.push<AccountUpdatedEvent>("account_updated", fields);
  }

  asset(asset_id: string, overrides: Partial<Fields<AssetCreatedEvent>> = {}): AssetCreatedEvent {
    const book = overrides.book ?? "core";
    return this.push<AssetCreatedEvent>("asset_created", {
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

  assetUpdated(fields: Fields<AssetUpdatedEvent>): AssetUpdatedEvent {
    return this.push<AssetUpdatedEvent>("asset_updated", fields);
  }

  settings(settings: Settings): SettingsChangedEvent {
    return this.push<SettingsChangedEvent>("settings_changed", { settings });
  }

  buy(overrides: Partial<Fields<BuyEvent>> & { account_id: string; asset_id: string }): BuyEvent {
    const value_date = overrides.value_date ?? overrides.trade_date ?? "2027-01-10";
    return this.push<BuyEvent>("buy", {
      trade_date: value_date,
      value_date,
      quantity: "10",
      unit_price: "100",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: value_date,
      fee: "0",
      source: "manual",
      ...overrides,
    });
  }

  sell(
    overrides: Partial<Fields<SellEvent>> & { account_id: string; asset_id: string },
  ): SellEvent {
    const value_date = overrides.value_date ?? overrides.trade_date ?? "2027-06-10";
    return this.push<SellEvent>("sell", {
      trade_date: value_date,
      value_date,
      quantity: "1",
      unit_price: "100",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: value_date,
      fee: "0",
      source: "manual",
      ...overrides,
    });
  }

  transfer(fields: Fields<TransferEvent>): TransferEvent {
    return this.push<TransferEvent>("transfer", fields);
  }

  dividend(
    overrides: Partial<Fields<DividendEvent>> & { account_id: string; asset_id: string },
  ): DividendEvent {
    return this.push<DividendEvent>("dividend", {
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

  interest(overrides: Partial<Fields<InterestEvent>> & { account_id: string }): InterestEvent {
    return this.push<InterestEvent>("interest", {
      value_date: "2027-04-30",
      gross: "5",
      withholding_spain: "0",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2027-04-30",
      ...overrides,
    });
  }

  fx(overrides: Partial<Fields<FxExchangeEvent>> & { account_id: string }): FxExchangeEvent {
    return this.push<FxExchangeEvent>("fx_exchange", {
      value_date: "2027-05-02",
      sold_amount: "1085",
      sold_currency: "EUR",
      bought_amount: "1170",
      bought_currency: "USD",
      fee: "2",
      fee_currency: "USD",
      fx_rate_sold: "1",
      fx_rate_bought: "1.0783",
      fx_rate_date: "2027-05-02",
      ...overrides,
    });
  }

  deposit(overrides: Partial<Fields<CashDepositEvent>> & { account_id: string }): CashDepositEvent {
    return this.push<CashDepositEvent>("cash_deposit", {
      value_date: "2026-08-31",
      amount: "5000",
      currency: "EUR",
      fx_rate: "1",
      ...overrides,
    });
  }

  withdrawal(
    overrides: Partial<Fields<CashWithdrawalEvent>> & { account_id: string },
  ): CashWithdrawalEvent {
    return this.push<CashWithdrawalEvent>("cash_withdrawal", {
      value_date: "2027-06-01",
      amount: "100",
      currency: "EUR",
      fx_rate: "1",
      ...overrides,
    });
  }

  fee(overrides: Partial<Fields<StandaloneFeeEvent>> & { account_id: string }): StandaloneFeeEvent {
    return this.push<StandaloneFeeEvent>("standalone_fee", {
      value_date: "2027-06-30",
      amount: "3",
      currency: "EUR",
      fx_rate: "1",
      description: "custody",
      ...overrides,
    });
  }

  valuation(
    overrides: Partial<Fields<ValuationEvent>> & { account_id: string; asset_id: string },
  ): ValuationEvent {
    return this.push<ValuationEvent>("valuation", {
      date: "2026-12-31",
      quantity: "5",
      unit_value: "210",
      currency: "EUR",
      fx_rate: "1",
      source: "manual",
      ...overrides,
    });
  }

  orderPlaced(
    overrides: Partial<Fields<OrderPlacedEvent>> & { account_id: string; asset_id: string },
  ): OrderPlacedEvent {
    return this.push<OrderPlacedEvent>("order_placed", {
      side: "buy",
      ...(overrides.quantity === undefined ? { amount: "500" } : {}),
      requested_date: "2027-07-01",
      ...overrides,
    });
  }

  orderUpdated(fields: Fields<OrderUpdatedEvent>): OrderUpdatedEvent {
    return this.push<OrderUpdatedEvent>("order_updated", fields);
  }

  transferRequested(fields: Fields<TransferRequestedEvent>): TransferRequestedEvent {
    return this.push<TransferRequestedEvent>("transfer_requested", fields);
  }

  transferRequestUpdated(fields: Fields<TransferRequestUpdatedEvent>): TransferRequestUpdatedEvent {
    return this.push<TransferRequestUpdatedEvent>("transfer_request_updated", fields);
  }

  reversal(reverses_id: Ulid, reason = "test"): ReversalEvent {
    return this.push<ReversalEvent>("reversal", { reverses_id, reason });
  }

  corporateAction(
    overrides: Partial<Fields<CorporateActionEvent>> &
      Pick<CorporateActionEvent, "kind" | "asset_id" | "effects">,
  ): CorporateActionEvent {
    return this.push<CorporateActionEvent>("corporate_action", {
      effective_date: "2027-03-01",
      source_document: "https://issuer.example/notice.pdf",
      ...overrides,
    });
  }

  thesisOpened(
    overrides: Partial<Fields<ThesisOpenedEvent>> & Pick<ThesisOpenedEvent, "thesis_id">,
  ): ThesisOpenedEvent {
    return this.push<ThesisOpenedEvent>("thesis_opened", {
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      hypothesis: "test hypothesis",
      expected_horizon_days: 90,
      invalidation: "test invalidation",
      planned_size_eur: "500",
      ...overrides,
    });
  }

  thesisClosed(thesis_id: string, closing_notes = "closed"): ThesisClosedEvent {
    return this.push<ThesisClosedEvent>("thesis_closed", { thesis_id, closing_notes });
  }
}

/** Catalogue shared by most projection tests: two core accounts, one bucket account, three assets. */
export const catalogue = (builder: LedgerBuilder): void => {
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
