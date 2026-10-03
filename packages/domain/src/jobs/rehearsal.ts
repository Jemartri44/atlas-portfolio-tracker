// The automatic rehearsal of a restore (feature 016, E4; ADR-0032, «La prueba
// de que se puede restaurar»; plan §9.2): **the last dump is loaded in memory,
// projected, and compared with the live ledger cut at the same events**. A
// copy that was never restored is not a copy; this is the quarterly proof that
// the dump of the cloud would restore to what the ledger says.
//
// - The live ledger is **cut at the events of the dump**, by identifier and in
//   its own order: what it added after the dump is not a difference.
// - Every event of the dump must be in the live ledger with the same content,
//   and in the same order; then both projections — positions, cash, lots and
//   the fiscal figures (realised gains and income) — must be the same.
// - Anything else is a difference, said **by code and by how many**, never by
//   an amount or an identifier (§8.1 P9).
//
// Never in `dev` with real data: `dev` only has synthetic data, and this does
// nothing different by environment (ADR-0032).

import type { CivilDate } from "../dates/civil-date.js";
import { Decimal } from "../money/decimal.js";
import { Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { LedgerState } from "../projections/state.js";
import type { LedgerEvent } from "../schema/events.js";
import { DUMP_LEDGER, dumpPrefix } from "./backup.js";
import type { RunRecord } from "./run-record.js";

export type Rehearsal =
  | { readonly ok: true; readonly events: number }
  | { readonly ok: false; readonly differs: Readonly<Record<string, number>> };

/** A value in one canonical text: maps and objects by sorted key, figures by their exact text. */
const canonical = (value: unknown): string => {
  if (value instanceof Money || value instanceof Quantity || value instanceof Decimal) {
    return JSON.stringify(value.toString());
  }
  if (value instanceof Map) {
    return canonical(Object.fromEntries([...value.entries()].map(([key, v]) => [String(key), v])));
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  // `undefined` gives the same text on both sides: nothing to tell apart.
  return String(JSON.stringify(value));
};

/** What is compared of a projection: what a restore has to give back. */
const SECTIONS: Readonly<Record<string, (state: LedgerState) => unknown>> = {
  positions_differ: (state) => state.positions,
  cash_differ: (state) => state.cash,
  lots_differ: (state) => state.lots,
  gains_differ: (state) => state.gains,
  income_differ: (state) => state.income,
};

export const restoreRehearsal = (input: {
  readonly dump: readonly LedgerEvent[];
  readonly live: readonly LedgerEvent[];
  readonly today: CivilDate;
}): Rehearsal => {
  // An id twice stops a projection even when it collects errors (`duplicate_id`):
  // the dump that repeats one is invalid, and a live ledger that does is not
  // projected, and said — never a failure of the whole integrity (review of
  // PR #109, copias B1). Its errors are said by the check anyway.
  const repeated = (events: readonly LedgerEvent[]): number =>
    events.length - new Set(events.map((event) => event.id)).size;
  if (repeated(input.dump) > 0) {
    return { ok: false, differs: { dump_invalid: repeated(input.dump) } };
  }
  if (repeated(input.live) > 0) {
    return { ok: false, differs: { rehearsal_skipped_invalid: 1 } };
  }
  const differs: Record<string, number> = {};
  const count = (code: string) => {
    differs[code] = (differs[code] ?? 0) + 1;
  };
  const live = new Map(input.live.map((event) => [event.id, event]));
  for (const event of input.dump) {
    const same = live.get(event.id);
    if (same === undefined) {
      count("event_missing_in_live");
    } else if (canonical(same) !== canonical(event)) {
      count("event_differs");
    }
  }
  const ids = new Set(input.dump.map((event) => event.id));
  const cut = input.live.filter((event) => ids.has(event.id));
  const inDump = input.dump.filter((event) => live.has(event.id)).map((event) => event.id);
  if (canonical(cut.map((event) => event.id)) !== canonical(inDump)) {
    count("order_differs");
  }
  const options = { collectErrors: true, asOf: input.today };
  const restored = projectLedger(input.dump, options);
  if (restored.invalid.length > 0) {
    return { ok: false, differs: { dump_invalid: restored.invalid.length } };
  }
  const kept = projectLedger(cut, options);
  for (const [code, section] of Object.entries(SECTIONS)) {
    if (canonical(section(restored)) !== canonical(section(kept))) {
      count(code);
    }
  }
  return Object.keys(differs).length === 0
    ? { ok: true, events: input.dump.length }
    : { ok: false, differs };
};

export interface LatestDump {
  readonly period: string;
  readonly ledgerKey: string;
  readonly ledgerSha256: string;
}

/**
 * The dump to rehearse with: the newest month whose dump **closed** (`done`)
 * with its ledger among its objects. A dump still open, failed or without its
 * ledger is not one a restore could start from.
 */
export const latestDump = (records: readonly RunRecord[]): LatestDump | undefined => {
  const found = records
    .filter((record) => record.task === "monthly_backup" && record.state === "done")
    .flatMap((record) => {
      const key = `${dumpPrefix(record.period)}${DUMP_LEDGER}`;
      const ledger = record.objects?.find((object) => object.key === key);
      return ledger === undefined
        ? []
        : [{ period: record.period, ledgerKey: key, ledgerSha256: ledger.sha256 }];
    })
    .sort((a, b) => b.period.localeCompare(a.period));
  return found[0];
};
