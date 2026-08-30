// What `atlas synth` prints: a shape summary of a ledger without any amount.

import type { LedgerEvent } from "../schema/events.js";

export interface LedgerSummary {
  events: number;
  by_type: Record<string, number>;
  accounts: string[];
  assets: string[];
  /** Years touched by any business date of the ledger, ascending. */
  years: number[];
}

const DATE_FIELDS = [
  "trade_date",
  "value_date",
  "value_date_out",
  "value_date_in",
  "date",
  "requested_date",
  "effective_date",
] as const;

export const summarizeLedger = (events: readonly LedgerEvent[]): LedgerSummary => {
  const byType = new Map<string, number>();
  const accounts = new Set<string>();
  const assets = new Set<string>();
  const years = new Set<number>();
  for (const event of events) {
    byType.set(event.type, (byType.get(event.type) ?? 0) + 1);
    if (event.type === "account_created") {
      accounts.add(event.account_id);
    }
    if (event.type === "asset_created") {
      assets.add(event.asset_id);
    }
    const record = event as unknown as Record<string, unknown>;
    for (const field of DATE_FIELDS) {
      const value = record[field];
      if (typeof value === "string") {
        years.add(Number(value.slice(0, 4)));
      }
    }
  }
  return {
    events: events.length,
    by_type: Object.fromEntries([...byType.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
    accounts: [...accounts].sort(),
    assets: [...assets].sort(),
    years: [...years].sort((a, b) => a - b),
  };
};
