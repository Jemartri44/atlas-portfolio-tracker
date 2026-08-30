import type { AccountCreatedEvent, CashDepositEvent, LedgerEvent } from "@atlas/domain";
import { encodeLine } from "@atlas/domain";

export const account: AccountCreatedEvent = {
  schema_version: 1,
  id: "01ARYZ6S41TSV4RRFFQ69G5FA0",
  recorded_at: "2026-09-01T18:22:05.000Z",
  type: "account_created",
  account_id: "acc_test",
  name: "Test",
  platform: "test",
  book: "core",
  base_currency: "EUR",
  country: "ES",
  active: true,
};

export const deposit: CashDepositEvent = {
  schema_version: 1,
  id: "01ARYZ6S41TSV4RRFFQ69G5FA1",
  recorded_at: "2026-09-01T18:23:05.000Z",
  type: "cash_deposit",
  account_id: "acc_test",
  value_date: "2026-09-01",
  amount: "100",
  currency: "EUR",
  fx_rate: "1",
  fingerprint: "sha256:0",
};

export const lineOf = (event: LedgerEvent): string => encodeLine(event);

export const futureLine = (): string =>
  lineOf(account).replace('"schema_version":1', '"schema_version":2');
