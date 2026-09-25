// What seals the prefix does not move (ADR-0026, Part B, amendment; case 9).
//
// A **closed classification** of every event type of the catalogue, written
// by hand: a type that is added tomorrow without deciding whether it seals
// does not compile (the record needs every key) and the test that walks the
// catalogue turns red. Today two types seal: a filed return, whose
// `ledger_fingerprint` is the digest of the lines before it, and the waiver of
// that verification, which `compact` writes inside the rewrite.

import { fingerprintOfLines } from "../filings/fingerprint.js";
import type { SupportedEventType } from "../schema/envelope.js";
import type { LedgerEvent, TaxReturnFiledEvent } from "../schema/events.js";
import type { LedgerSchema } from "../schema/migrations/index.js";

export const SEALS_PREFIX: Readonly<Record<SupportedEventType, boolean>> = {
  account_created: false,
  account_updated: false,
  asset_created: false,
  asset_updated: false,
  settings_changed: false,
  buy: false,
  sell: false,
  swap: false,
  transfer: false,
  dividend: false,
  interest: false,
  fx_exchange: false,
  cash_deposit: false,
  cash_withdrawal: false,
  standalone_fee: false,
  valuation: false,
  order_placed: false,
  order_updated: false,
  transfer_requested: false,
  transfer_request_updated: false,
  corporate_action: false,
  thesis_opened: false,
  thesis_closed: false,
  reversal: false,
  tax_return_filed: true,
  filing_fingerprint_waived: true,
};

/** Whether an event seals the prefix it sits on. A type outside the classification seals: the safe side. */
export const sealsPrefix = (event: LedgerEvent): boolean =>
  (SEALS_PREFIX as Record<string, boolean | undefined>)[event.type] !== false;

/**
 * Whether a filed return still matches the lines it would sit on (`docs/api.md`
 * §5.2, row 8; decision P6): the count its fingerprint declares is the number
 * of lines before it, and their digest is the one it recorded.
 */
export const sealHolds = (
  prefix: readonly string[],
  filing: TaxReturnFiledEvent,
  schema: LedgerSchema,
): boolean => {
  const declared = filing.ledger_fingerprint;
  if (declared.lines !== prefix.length) {
    return false;
  }
  try {
    return fingerprintOfLines(prefix, declared.schema_version, schema) === declared.sha256;
  } catch {
    return false;
  }
};
