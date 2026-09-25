// Ledgers for the tests of the sync: a shared base, two devices that extend it
// with ids that never collide, and corrections written as the application
// writes them (the reversal, then the corrected event with `corrects_id`).

import type { LedgerEvent, ReversalEvent, SupportedEvent } from "../../src/schema/events.js";
import { fingerprintOf } from "../../src/schema/fingerprint.js";
import { encodeLine } from "../../src/schema/line.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import type { LocalSide } from "../../src/sync/client-plan.js";
import { markerFor } from "../../src/sync/marker.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

export const linesOf = (events: readonly LedgerEvent[]): string[] => events.map(encodeLine);
export const textOf = (events: readonly LedgerEvent[]): string =>
  events.map((event) => `${encodeLine(event)}\n`).join("");

/** The catalogue and a buy of 10 `ast_world` in `acc_fund`: what both devices start from. */
export const baseLedger = (): { builder: LedgerBuilder; events: LedgerEvent[] } => {
  const builder = new LedgerBuilder();
  catalogue(builder);
  builder.buy({ account_id: "acc_fund", asset_id: "ast_world" });
  return { builder, events: builder.build() };
};

/** A device extending `base` with ids of its own, starting at `offset`. */
export const device = (offset: number): LedgerBuilder => new LedgerBuilder(offset);

/** The reversal of `original` and its correction with `changes`, as `correctEvent` writes them. */
export const correction = <E extends SupportedEvent>(
  builder: LedgerBuilder,
  original: E,
  changes: Partial<E>,
): [ReversalEvent, E] => {
  const reversal = builder.reversal(original.id, "typo");
  const {
    schema_version: _v,
    id: _id,
    recorded_at: _at,
    fingerprint: _fp,
    ...fields
  } = original as E & { fingerprint?: string };
  const draft = {
    ...builder.nextEnvelope(original.type),
    ...fields,
    ...changes,
    corrects_id: original.id,
  };
  const fingerprint = fingerprintOf(draft as unknown as Parameters<typeof fingerprintOf>[0]);
  const corrected = (fingerprint === undefined ? draft : { ...draft, fingerprint }) as unknown as E;
  builder.raw(corrected);
  return [reversal, corrected];
};

/** The device as its store reads it: synced up to `synced` lines, nothing held. */
export const localSide = (
  events: readonly LedgerEvent[],
  synced: number,
  extra: Partial<LocalSide> = {},
): LocalSide => {
  const lines = linesOf(events);
  return {
    lines,
    events,
    marker: markerFor(lines, synced),
    held: [],
    confirmations: [],
    ...extra,
  };
};

/**
 * A ledger a settings change reinterprets (as in `record-event.test.ts`): a
 * fund bought and sold on dates that swap order when the fiscal date becomes
 * the trade date.
 */
export const reorderable = (): { builder: LedgerBuilder; events: LedgerEvent[] } => {
  const builder = new LedgerBuilder();
  catalogue(builder);
  builder.settings(DEFAULT_SETTINGS);
  builder.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    trade_date: "2027-01-13",
    value_date: "2027-01-15",
    quantity: "10",
  });
  builder.sell({
    account_id: "acc_fund",
    asset_id: "ast_world",
    trade_date: "2027-01-12",
    value_date: "2027-01-20",
    quantity: "10",
  });
  return { builder, events: builder.build() };
};

export const byTradeDate = mergeSettings(DEFAULT_SETTINGS, {
  fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, fund: "trade_date" },
});
