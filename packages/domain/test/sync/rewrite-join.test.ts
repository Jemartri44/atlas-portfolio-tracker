// A rewritten remote downloaded again, and the two ways of joining (ADR-0026,
// Part A and Part B; §6.3 (V2), (V6), (V7) and (V15); decision D-Q5).

import { describe, expect, it } from "vitest";
import { fingerprintOfEvents, resealFilings } from "../../src/filings/fingerprint.js";
import type { BuyEvent, LedgerEvent, TaxReturnFiledEvent } from "../../src/schema/events.js";
import { unresolvedHeld } from "../../src/sync/held.js";
import { initRefusal, joinWithMine, replaceWithRemote } from "../../src/sync/join.js";
import {
  canonicalForRewrite,
  classifyAgainst,
  REWRITTEN_BY_COMPACT,
} from "../../src/sync/rewrite.js";
import { baseLedger, byTradeDate, correction, device, linesOf, reorderable } from "./helpers.js";

describe("classifying against a rewritten remote (V2, V15)", () => {
  const { events } = baseLedger();
  const b = device(100);
  const filing = b.filed({
    tax_year: 2026,
    ledger_fingerprint: fingerprintOfEvents(events),
  }) as TaxReturnFiledEvent;
  const pending = b.deposit({ account_id: "acc_fund" });
  const local = {
    lines: linesOf([...events, filing, pending]),
    events: [...events, filing, pending],
  };

  it("ignores exactly the seal of the filings, and nothing else", () => {
    expect(REWRITTEN_BY_COMPACT).toEqual({ tax_return_filed: ["ledger_fingerprint"] });
    const resealed = {
      ...filing,
      ledger_fingerprint: { ...filing.ledger_fingerprint, sha256: "f".repeat(64) },
    };
    expect(canonicalForRewrite(resealed)).toBe(canonicalForRewrite(filing));
    expect(canonicalForRewrite({ ...filing, notes: "x" })).not.toBe(canonicalForRewrite(filing));
  });

  it("keeps back nothing a compaction kept, the resealed filing included", () => {
    const compacted = resealFilings([...events, filing, pending], 1);
    expect((compacted[events.length] as TaxReturnFiledEvent).ledger_fingerprint).toBeDefined();
    expect(classifyAgainst(local, compacted)).toEqual({ absent: [], differs: [] });
  });

  it("keeps back everything the device had and the remote lacks, synced or pending, and a real conflict", () => {
    const buy = events[events.length - 1] as BuyEvent;
    const restored = [...events.slice(0, -1), { ...buy, quantity: "11" }];
    expect(classifyAgainst(local, restored)).toEqual({
      absent: linesOf([filing, pending]),
      differs: linesOf([buy]),
    });
  });

  it("writes one held record per line, with the literal of the origin", () => {
    const restored = events.slice(0, -1);
    const rewrite = replaceWithRemote(local, restored, "rewrite", "t");
    expect(
      rewrite.map(
        (record) => record.kind === "held" && [record.reason.code, record.origin, record.members],
      ),
    ).toEqual([
      ["absent_after_rewrite", "rewrite", 1],
      ["absent_after_rewrite", "rewrite", 1],
      ["absent_after_rewrite", "rewrite", 1],
    ]);
    const buy = events[events.length - 1] as BuyEvent;
    const join = replaceWithRemote(
      local,
      [...events.slice(0, -1), { ...buy, fee: "9" }],
      "join",
      "t",
    );
    expect(join.map((record) => record.kind === "held" && record.reason.code)).toEqual([
      "differs_at_join",
      "absent_at_join",
      "absent_at_join",
    ]);
    const differs = replaceWithRemote(
      local,
      [...events.slice(0, -1), { ...buy, fee: "9" }, filing, pending],
      "rewrite",
      "t",
    );
    expect(differs.map((record) => record.kind === "held" && record.reason.code)).toEqual([
      "differs_after_rewrite",
    ]);
  });
});

describe("downloading again never splits a pair (NB5 of the review of PR #83)", () => {
  it("holds a reversal and its correction back as one unit", () => {
    const { events } = baseLedger();
    const b = device(700);
    const deposit = b.deposit({ account_id: "acc_fund" });
    const pair = correction(b, deposit, { amount: "9" });
    const local = {
      lines: linesOf([...events, deposit, ...pair]),
      events: [...events, deposit, ...pair],
    };
    const records = replaceWithRemote(local, [...events, deposit], "rewrite", "t");
    const units = unresolvedHeld(records);
    expect(units.map((unit) => [unit.reason.code, unit.lines])).toEqual([
      ["absent_after_rewrite", linesOf(pair)],
    ]);
    const changed = replaceWithRemote(
      local,
      [...events, { ...deposit, amount: "1" } as LedgerEvent],
      "join",
      "t",
    );
    expect(unresolvedHeld(changed).map((unit) => [unit.reason.code, unit.lines.length])).toEqual([
      ["differs_at_join", 1],
      ["absent_at_join", 2],
    ]);
  });
});

describe("starting: the first device and the one that joins", () => {
  const { events } = baseLedger();

  it("refuses to initialise an invalid ledger before calling (V7)", () => {
    expect(initRefusal(events)).toBeUndefined();
    const { builder, events: reordered } = reorderable();
    const invalid = [...reordered, builder.settings(byTradeDate)];
    const refusal = initRefusal(invalid);
    expect(refusal?.code).toBe("init_refused_invalid_ledger");
    expect(refusal?.details.invalid).toEqual([
      { id: reordered[reordered.length - 1]?.id, code: "insufficient_position" },
    ]);
    const twice = initRefusal([...events, events[0] as LedgerEvent]);
    expect(twice?.details.invalid).toEqual([{ id: events[0]?.id, code: "duplicate_id" }]);
  });

  it("joins with its own lines as pending behind the remote, without those the remote has byte for byte", () => {
    const b = device(100);
    const mine = b.deposit({ account_id: "acc_fund" });
    const theirs = device(200).deposit({ account_id: "acc_fund", amount: "4" });
    const local = { lines: linesOf([...events, mine]), events: [...events, mine] };
    const joined = joinWithMine(local, linesOf([...events, theirs]));
    expect(joined).toEqual({
      lines: linesOf([...events, theirs, mine]),
      synced: events.length + 1,
      invalid: [],
    });
  });
});
