// What sets the ledger up without moving anything: it is not a movement.

import type { LedgerEntry } from "@atlas/domain";

export const SETUP_EVENTS: ReadonlySet<string> = new Set([
  "account_created",
  "account_updated",
  "asset_created",
  "asset_updated",
  "settings_changed",
]);

export const isMovement = (entry: LedgerEntry): boolean => !SETUP_EVENTS.has(entry.event.type);
