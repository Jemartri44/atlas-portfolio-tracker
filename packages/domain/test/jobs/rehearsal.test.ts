// Feature 016, E4 (plan §9.2; ADR-0032, «La prueba de que se puede
// restaurar»; mutant 29): the automatic rehearsal of a restore. The last dump
// is projected in memory and compared with the live ledger **cut at the same
// events**: what the live ledger added after the dump is not a difference,
// and anything else is, said by code and by how many — never an amount.

import { describe, expect, it } from "vitest";
import { latestDump, restoreRehearsal } from "../../src/jobs/rehearsal.js";
import { claimRecord, type RunRecord, recordIn } from "../../src/jobs/run-record.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const TODAY = "2026-10-01";

/** A core with a buy, a sale and a dividend: lots, cash and fiscal figures to compare. */
const live = (): LedgerEvent[] => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.deposit({ account_id: "acc_fund", amount: "10000", value_date: "2026-01-02" });
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "6",
    unit_price: "1000",
    trade_date: "2026-01-05",
  });
  b.sell({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "2",
    unit_price: "1200",
    trade_date: "2026-06-10",
  });
  b.dividend({
    account_id: "acc_fund",
    asset_id: "ast_world",
    value_date: "2026-07-01",
    fx_rate_date: "2026-06-30",
  });
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_bonds",
    quantity: "3",
    unit_price: "100",
    trade_date: "2026-09-20",
  });
  return b.build();
};

describe("the rehearsal of a restore (mutant 29)", () => {
  it("finds nothing when the dump is the live ledger, or a beginning of it", () => {
    const events = live();
    expect(restoreRehearsal({ dump: events, live: events, today: TODAY })).toEqual({
      ok: true,
      events: events.length,
    });
    // The live ledger went on after the dump: cut at the same events, no difference.
    const dump = events.slice(0, -1);
    expect(restoreRehearsal({ dump, live: events, today: TODAY })).toEqual({
      ok: true,
      events: dump.length,
    });
  });

  it("says an event of the dump the live ledger does not have, and what it moves", () => {
    const events = live();
    const stranger = { ...events.at(-1), id: "01ZZZZZZZZZZZZZZZZZZZZZZZZ" } as LedgerEvent;
    expect(restoreRehearsal({ dump: [...events, stranger], live: events, today: TODAY })).toEqual({
      ok: false,
      differs: {
        event_missing_in_live: 1,
        cash_differ: 1,
        lots_differ: 1,
        positions_differ: 1,
      },
    });
  });

  it("says an event with the same id and other content, and every figure it moves", () => {
    const events = live();
    const index = events.findIndex((event) => event.type === "sell");
    const changed = events.map((event, at) =>
      at === index ? ({ ...event, unit_price: "1300" } as LedgerEvent) : event,
    );
    expect(restoreRehearsal({ dump: changed, live: events, today: TODAY })).toEqual({
      ok: false,
      differs: { event_differs: 1, cash_differ: 1, gains_differ: 1 },
    });
  });

  it("says the same events in another order", () => {
    const events = live();
    const swapped = [...events];
    const last = swapped.length - 1;
    [swapped[last - 1], swapped[last]] = [
      swapped[last] as LedgerEvent,
      swapped[last - 1] as LedgerEvent,
    ];
    expect(restoreRehearsal({ dump: swapped, live: events, today: TODAY })).toMatchObject({
      ok: false,
      differs: { order_differs: 1 },
    });
  });

  it("says a dump that does not project, by how many events it refuses", () => {
    const events = live();
    const broken = events.map((event) =>
      event.type === "sell" ? ({ ...event, quantity: "60" } as LedgerEvent) : event,
    );
    const result = restoreRehearsal({ dump: broken, live: broken, today: TODAY });
    expect(result).toEqual({ ok: false, differs: { dump_invalid: 1 } });
  });
});

describe("the last dump to rehearse with", () => {
  const SHA = "d".repeat(64);
  const done = (period: string, objects = true): RunRecord =>
    recordIn(
      claimRecord("monthly_backup", period, "2026-10-01T01:15:00Z"),
      "done",
      "2026-10-01T01:16:00Z",
      {
        outcome: { code: "backup_done" },
        ...(objects ? { objects: [{ key: `backups/${period}/ledger.jsonl`, sha256: SHA }] } : {}),
      },
    );

  it("is the newest month whose dump closed, with the SHA-256 of its ledger", () => {
    const open = claimRecord("monthly_backup", "2026-10", "2026-10-01T01:15:00Z");
    expect(latestDump([done("2026-08"), open, done("2026-09"), done("2026-07")])).toEqual({
      period: "2026-09",
      ledgerKey: "backups/2026-09/ledger.jsonl",
      ledgerSha256: SHA,
    });
  });

  it("is none when no dump closed with its ledger", () => {
    expect(latestDump([])).toBeUndefined();
    expect(
      latestDump([claimRecord("monthly_backup", "2026-10", "2026-10-01T01:15:00Z")]),
    ).toBeUndefined();
    expect(latestDump([done("2026-09", false)])).toBeUndefined();
    const failed = recordIn(
      claimRecord("monthly_backup", "2026-09", "2026-10-01T01:15:00Z"),
      "failed",
      "2026-10-01T01:16:00Z",
      {
        objects: [{ key: "backups/2026-09/ledger.jsonl", sha256: SHA }],
      },
    );
    expect(latestDump([failed])).toBeUndefined();
  });
});
