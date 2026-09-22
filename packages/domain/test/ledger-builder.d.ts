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
  SwapEvent,
  TaxReturnFiledEvent,
  ThesisClosedEvent,
  ThesisOpenedEvent,
  TransferEvent,
  TransferRequestedEvent,
  TransferRequestUpdatedEvent,
  ValuationEvent,
} from "../src/schema/events.js";
import { type Settings } from "../src/settings/settings.js";
export declare const idOf: (sequence: number) => Ulid;
type Fields<E extends SupportedEvent> = Omit<E, keyof Envelope | "fingerprint"> & {
  fingerprint?: string;
};
export declare class LedgerBuilder {
  private readonly events;
  private sequence;
  private recordedOn;
  /** `start` offsets the id sequence so two builders can extend the same ledger without colliding. */
  constructor(start?: number);
  /**
   * Moves the administrative clock: what follows is recorded on that day. Only
   * theses read it (`opened_at` and `closed_at` come from `recorded_at`);
   * everything else is dated by its own business fields.
   */
  recordedAt(date: string): void;
  private envelope;
  private push;
  raw(event: LedgerEvent): LedgerEvent;
  nextEnvelope(type: LedgerEvent["type"]): Envelope;
  build(): LedgerEvent[];
  account(
    account_id: string,
    overrides?: Partial<Fields<AccountCreatedEvent>>,
  ): AccountCreatedEvent;
  accountUpdated(fields: Fields<AccountUpdatedEvent>): AccountUpdatedEvent;
  asset(asset_id: string, overrides?: Partial<Fields<AssetCreatedEvent>>): AssetCreatedEvent;
  assetUpdated(fields: Fields<AssetUpdatedEvent>): AssetUpdatedEvent;
  settings(settings: Settings): SettingsChangedEvent;
  buy(
    overrides: Partial<Fields<BuyEvent>> & {
      account_id: string;
      asset_id: string;
    },
  ): BuyEvent;
  sell(
    overrides: Partial<Fields<SellEvent>> & {
      account_id: string;
      asset_id: string;
    },
  ): SellEvent;
  swap(
    overrides: Partial<Fields<SwapEvent>> & {
      account_id: string;
      from_asset_id: string;
      to_asset_id: string;
    },
  ): SwapEvent;
  transfer(fields: Fields<TransferEvent>): TransferEvent;
  dividend(
    overrides: Partial<Fields<DividendEvent>> & {
      account_id: string;
      asset_id: string;
    },
  ): DividendEvent;
  interest(
    overrides: Partial<Fields<InterestEvent>> & {
      account_id: string;
    },
  ): InterestEvent;
  fx(
    overrides: Partial<Fields<FxExchangeEvent>> & {
      account_id: string;
    },
  ): FxExchangeEvent;
  deposit(
    overrides: Partial<Fields<CashDepositEvent>> & {
      account_id: string;
    },
  ): CashDepositEvent;
  withdrawal(
    overrides: Partial<Fields<CashWithdrawalEvent>> & {
      account_id: string;
    },
  ): CashWithdrawalEvent;
  fee(
    overrides: Partial<Fields<StandaloneFeeEvent>> & {
      account_id: string;
    },
  ): StandaloneFeeEvent;
  valuation(
    overrides: Partial<Fields<ValuationEvent>> & {
      account_id: string;
      asset_id: string;
    },
  ): ValuationEvent;
  orderPlaced(
    overrides: Partial<Fields<OrderPlacedEvent>> & {
      account_id: string;
      asset_id: string;
    },
  ): OrderPlacedEvent;
  orderUpdated(fields: Fields<OrderUpdatedEvent>): OrderUpdatedEvent;
  transferRequested(fields: Fields<TransferRequestedEvent>): TransferRequestedEvent;
  transferRequestUpdated(fields: Fields<TransferRequestUpdatedEvent>): TransferRequestUpdatedEvent;
  reversal(reverses_id: Ulid, reason?: string): ReversalEvent;
  corporateAction(
    overrides: Partial<Fields<CorporateActionEvent>> &
      Pick<CorporateActionEvent, "kind" | "asset_id" | "effects">,
  ): CorporateActionEvent;
  thesisOpened(
    overrides: Partial<Fields<ThesisOpenedEvent>> & Pick<ThesisOpenedEvent, "thesis_id">,
  ): ThesisOpenedEvent;
  thesisClosed(thesis_id: string, closing_notes?: string): ThesisClosedEvent;
  /**
   * A filed return (ADR-0020). Defaults to a `renta` that declares nothing, so
   * a test only writes the figures it is about. The administrative clock moves
   * to the day it was filed, because `filed_at` may not be after the day the
   * event was recorded.
   */
  filed(
    overrides: Partial<Fields<TaxReturnFiledEvent>> & Pick<TaxReturnFiledEvent, "tax_year">,
  ): TaxReturnFiledEvent;
}
/** Catalogue shared by most projection tests: two core accounts, one bucket account, three assets. */
export declare const catalogue: (builder: LedgerBuilder) => void;
//# sourceMappingURL=ledger-builder.d.ts.map
