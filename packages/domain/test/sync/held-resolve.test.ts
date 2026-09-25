// What is held back and how it is resolved (ADR-0026, Part B; plan §10;
// §6.3 (V16); decision D-Q1: resolving never needs a valid ledger).

import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { fingerprintOfEvents } from "../../src/filings/fingerprint.js";
import type { BuyEvent, LedgerEvent } from "../../src/schema/events.js";
import {
  type HeldRecord,
  holdRecords,
  parseDiscarded,
  parseHeld,
  recordsText,
  unresolvedHeld,
} from "../../src/sync/held.js";
import { lineSha256 } from "../../src/sync/lines.js";
import {
  confirmHeld,
  discardHeld,
  redoFinished,
  redoPlan,
  redoRecorded,
  redoStarted,
  resolutionsFor,
} from "../../src/sync/resolve.js";
import { baseLedger, correction, device, linesOf } from "./helpers.js";

const { events } = baseLedger();
const buy = events[events.length - 1] as BuyEvent;
const b = device(100);
const deposit = b.deposit({ account_id: "acc_fund" });
const pair = correction(b, buy, { quantity: "5" });

const unreadable = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe("sync_held_unreadable");
    return (error as ValidationError).details;
  }
  throw new Error("read");
};

describe("the held records", () => {
  it("round-trip, with the line inside as a string, byte for byte", () => {
    const records = holdRecords(
      linesOf(pair),
      "client",
      { code: "pair_rejected", details: { member: "other" } },
      "t",
    );
    expect(parseHeld(recordsText(records))).toEqual(records);
    expect(
      records.map(
        (record) => record.kind === "held" && [record.member, record.members, record.unit],
      ),
    ).toEqual([
      [0, 2, lineSha256(linesOf(pair)[0] as string)],
      [1, 2, lineSha256(linesOf(pair)[0] as string)],
    ]);
    const discarded = discardHeld(unresolvedHeld(records)[0] as never, "t").discarded;
    expect(parseDiscarded(recordsText(discarded))).toEqual(discarded);
  });

  it("are read strictly: a record that is not one is an error, never skipped", () => {
    expect(unreadable(() => parseHeld("{\n"))).toEqual({ file: "held", line: 1 });
    for (const bad of [
      [],
      { held_format: 2, kind: "held", at: "t", line: "x" },
      { held_format: 1, kind: "other", at: "t" },
      { held_format: 1, kind: "held", at: 1, line: "x" },
      { held_format: 1, kind: "held", at: "t" },
      { held_format: 1, kind: "resolved", at: "t" },
    ]) {
      expect(unreadable(() => parseHeld(`${JSON.stringify(bad)}\n`))).toEqual({
        file: "held",
        line: 1,
      });
    }
    expect(unreadable(() => parseDiscarded("{\n"))).toEqual({ file: "discarded", line: 1 });
    expect(unreadable(() => parseDiscarded('{"discarded_format":2,"line":"x"}\n'))).toEqual({
      file: "discarded",
      line: 1,
    });
  });

  it("say what is unresolved now: the last record of a line decides", () => {
    const records: HeldRecord[] = [
      ...holdRecords(
        linesOf([deposit]),
        "remote",
        { code: "recorded_at_in_future", details: {} },
        "t1",
      ),
      ...holdRecords(linesOf(pair), "client", { code: "pair_rejected", details: {} }, "t2"),
    ];
    const units = unresolvedHeld(records);
    expect(units.map((unit) => [unit.origin, unit.reason.code, unit.lines.length])).toEqual([
      ["remote", "recorded_at_in_future", 1],
      ["client", "pair_rejected", 2],
    ]);
    const resolved = [...records, ...discardHeld(units[0] as never, "t3").records];
    expect(unresolvedHeld(resolved).map((unit) => unit.reason.code)).toEqual(["pair_rejected"]);
    const started = [
      ...records,
      ...redoStarted(units[0] as never, "01ARYZ6S41TSV4RRFFQ69ZZZZZ", "t4"),
    ];
    expect(unresolvedHeld(started)[0]?.redo).toBe("01ARYZ6S41TSV4RRFFQ69ZZZZZ");
  });
});

describe("resolving (R18)", () => {
  const duplicate = unresolvedHeld(
    holdRecords(
      linesOf([deposit]),
      "client",
      { code: "new_duplicate", details: { existing: ["X"] } },
      "t",
    ),
  )[0] as NonNullable<ReturnType<typeof unresolvedHeld>[number]>;
  const heldPair = unresolvedHeld(
    holdRecords(linesOf(pair), "client", { code: "pair_rejected", details: {} }, "t"),
  )[0] as typeof duplicate;

  it("offers to confirm a warning only, to redo anything but a filing the remote has (V16), and always to discard", () => {
    expect(resolutionsFor(duplicate, [deposit], new Set())).toEqual(["confirm", "redo", "discard"]);
    expect(resolutionsFor(heldPair, pair, new Set())).toEqual(["redo", "discard"]);
    const filing = device(200).filed({
      tax_year: 2026,
      ledger_fingerprint: fingerprintOfEvents(events),
    });
    const heldFiling = unresolvedHeld(
      holdRecords(linesOf([filing]), "client", { code: "seals_prefix", details: {} }, "t"),
    )[0] as typeof duplicate;
    expect(resolutionsFor(heldFiling, [filing], new Set([filing.id]))).toEqual(["discard"]);
    expect(resolutionsFor(heldFiling, [filing], new Set())).toEqual(["redo", "discard"]);
    expect(() => redoPlan(heldFiling, [filing], new Set([filing.id]))).toThrow(ValidationError);
  });

  it("confirms by putting the unit back right after the synced prefix and remembering what was confirmed", () => {
    const local = { lines: ["a", "b", "pending"], synced: 2 };
    const done = confirmHeld(duplicate, [deposit], new Set(), local, "t");
    expect(done.lines).toEqual(["a", "b", linesOf([deposit])[0], "pending"]);
    expect(done.confirmations).toEqual([
      {
        line_sha256: lineSha256(linesOf([deposit])[0] as string),
        duplicates: ["X"],
        closed: [],
        confirmed_at: "t",
      },
    ]);
    expect(
      unresolvedHeld([
        ...holdRecords(linesOf([deposit]), "client", duplicate.reason, "t"),
        ...done.records,
      ]),
    ).toEqual([]);
    const closed = unresolvedHeld(
      holdRecords(
        linesOf([deposit]),
        "client",
        { code: "new_closed_year", details: { filings: ["F"] } },
        "t",
      ),
    )[0] as typeof duplicate;
    expect(confirmHeld(closed, [deposit], new Set(), local, "t").confirmations[0]?.closed).toEqual([
      "F",
    ]);
    expect(() => confirmHeld(heldPair, pair, new Set(), local, "t")).toThrow(ValidationError);
  });

  it("discards a whole unit, or only the reversal of a pair, holding its correction again on its own (8e)", () => {
    const whole = discardHeld(heldPair, "t");
    expect(whole.discarded.map((record) => [record.line, record.reason.code])).toEqual(
      linesOf(pair).map((line) => [line, "discarded_by_user"]),
    );
    const onlyReversal = discardHeld(heldPair, "t", "reversal");
    expect(onlyReversal.discarded.map((record) => record.line)).toEqual([linesOf(pair)[0]]);
    const records = [
      ...holdRecords(linesOf(pair), "client", heldPair.reason, "t"),
      ...onlyReversal.records,
    ];
    expect(unresolvedHeld(records).map((unit) => [unit.reason.code, unit.lines])).toEqual([
      ["partner_discarded", [linesOf(pair)[1]]],
    ]);
    expect(() => discardHeld(duplicate, "t", "reversal")).toThrow(ValidationError);
  });

  it("plans a redo as a new event, a correction of the same target or the same reversal", () => {
    expect(redoPlan(duplicate, [deposit], new Set())).toMatchObject({
      kind: "record",
      draft: { type: "cash_deposit" },
    });
    expect(redoPlan(heldPair, pair, new Set())).toMatchObject({
      kind: "correct",
      target_id: buy.id,
      draft: { quantity: "5" },
    });
    const lone = b.reversal(deposit.id, "why");
    const heldLone = unresolvedHeld(
      holdRecords(linesOf([lone]), "client", { code: "domain_rejected", details: {} }, "t"),
    )[0] as typeof duplicate;
    expect(redoPlan(heldLone, [lone], new Set())).toEqual({
      kind: "reverse",
      target_id: deposit.id,
      reason: "why",
    });
    const draft = (redoPlan(duplicate, [deposit], new Set()) as { draft: Record<string, unknown> })
      .draft;
    expect(Object.keys(draft)).not.toContain("id");
    expect(Object.keys(draft)).not.toContain("fingerprint");
  });

  it("seals the id of a redo before recording it, and knows it recorded by that exact id only", () => {
    const started = unresolvedHeld([
      ...holdRecords(linesOf([deposit]), "client", duplicate.reason, "t"),
      ...redoStarted(duplicate, "01ARYZ6S41TSV4RRFFQ69ZZZZZ", "t"),
    ])[0] as typeof duplicate;
    expect(redoRecorded(started, [deposit])).toBe(false);
    expect(
      redoRecorded(started, [{ ...deposit, id: "01ARYZ6S41TSV4RRFFQ69ZZZZZ" } as LedgerEvent]),
    ).toBe(true);
    expect(redoRecorded(duplicate, [deposit])).toBe(false);
    const finished = redoFinished(started, "01ARYZ6S41TSV4RRFFQ69ZZZZZ", "t");
    expect(finished.discarded[0]).toMatchObject({
      reason: { code: "redone" },
      replaced_by: "01ARYZ6S41TSV4RRFFQ69ZZZZZ",
    });
    expect(finished.records[0]).toMatchObject({
      kind: "resolved",
      resolution: "redone",
      event_id: "01ARYZ6S41TSV4RRFFQ69ZZZZZ",
    });
  });
});
