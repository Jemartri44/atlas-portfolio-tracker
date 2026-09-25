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
  decisionOf,
  discardHeld,
  type RedoPlan,
  redoFinished,
  redoneLines,
  resolutionsFor,
  sealedIds,
  startRedoPlan,
} from "../../src/sync/resolve.js";
import { baseLedger, correction, device, linesOf } from "./helpers.js";

type Unit = NonNullable<ReturnType<typeof unresolvedHeld>[number]>;

/** Ids in order, distinct. */
const ids = (...list: string[]): (() => string) => {
  let next = 0;
  return () => list[next++] ?? `01ZZZZZZZZZZZZZZZZZZZZZZ${next}`;
};

/** The plan of a redo, over a ledger (the current state), sealing the ids given. */
const planFor = (
  unit: Unit,
  events: readonly LedgerEvent[],
  ledger: readonly LedgerEvent[] = [],
  seal: () => string = ids("01ARYZ6S41TSV4RRFFQ69ZZZZA", "01ARYZ6S41TSV4RRFFQ69ZZZZB"),
): RedoPlan => startRedoPlan(unit, events, new Set(), ledger, seal, "t").plan;

/** The unit as it reads after sealing its redo. */
const sealedUnit = (
  records: readonly HeldRecord[],
  events: readonly LedgerEvent[],
  seal: () => string,
): Unit => {
  const unit = unresolvedHeld(records)[0] as Unit;
  return unresolvedHeld([
    ...records,
    ...startRedoPlan(unit, events, new Set(), [], seal, "t").records,
  ])[0] as Unit;
};

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
    expect(units[0]?.held_at).toBe("t1");
    const started = [
      ...records,
      ...startRedoPlan(
        units[0] as never,
        [deposit],
        new Set(),
        [],
        ids("01ARYZ6S41TSV4RRFFQ69ZZZZZ"),
        "t4",
      ).records,
    ];
    expect(unresolvedHeld(started)[0]?.sealed).toEqual({
      [lineSha256(units[0]?.lines[0] as string)]: "01ARYZ6S41TSV4RRFFQ69ZZZZZ",
    });
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
    expect(() => startRedoPlan(heldFiling, [filing], new Set([filing.id]), [], ids(), "t")).toThrow(
      expect.objectContaining({ code: "redo_filing_in_remote" }),
    );
  });

  it("does not offer to redo a correction whose reversal was discarded: only to discard it", () => {
    const alone = unresolvedHeld(
      holdRecords(linesOf([pair[1]]), "client", { code: "partner_discarded", details: {} }, "t"),
    )[0] as typeof duplicate;
    expect(resolutionsFor(alone, [pair[1]], new Set())).toEqual(["discard"]);
    expect(() => planFor(alone, [pair[1]])).toThrow(
      expect.objectContaining({ code: "redo_partner_discarded" }),
    );
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

  it("plans a redo as a new event, a correction of the same target or the same reversal, with sealed ids", () => {
    expect(planFor(duplicate, [deposit])).toMatchObject({
      kind: "record",
      draft: { type: "cash_deposit" },
      id: "01ARYZ6S41TSV4RRFFQ69ZZZZA",
    });
    expect(planFor(heldPair, pair)).toMatchObject({
      kind: "correct",
      target_id: buy.id,
      draft: { quantity: "5" },
      reversal_id: "01ARYZ6S41TSV4RRFFQ69ZZZZA",
      id: "01ARYZ6S41TSV4RRFFQ69ZZZZB",
    });
    const lone = b.reversal(deposit.id, "why");
    const heldLone = unresolvedHeld(
      holdRecords(linesOf([lone]), "client", { code: "domain_rejected", details: {} }, "t"),
    )[0] as typeof duplicate;
    expect(planFor(heldLone, [lone])).toEqual({
      kind: "reverse",
      target_id: deposit.id,
      reason: "why",
      draft: { type: "reversal", reverses_id: deposit.id, reason: "why" },
      id: "01ARYZ6S41TSV4RRFFQ69ZZZZA",
    });
    const draft = (planFor(duplicate, [deposit]) as { draft: Record<string, unknown> }).draft;
    expect(Object.keys(draft)).not.toContain("id");
    expect(Object.keys(draft)).not.toContain("fingerprint");
  });

  it("corrects the version in force: the other device's correction of the same target (case 3)", () => {
    const other = correction(device(300), buy, { quantity: "7" });
    const again = correction(device(310), other[1], { quantity: "8" });
    expect(planFor(heldPair, pair, [buy, ...other])).toMatchObject({ target_id: other[1].id });
    expect(planFor(heldPair, pair, [buy, ...other, ...again])).toMatchObject({
      target_id: again[1].id,
    });
    // Reversed and not corrected: the target stays, and recording says why it cannot.
    const gone = device(320).reversal(buy.id);
    expect(planFor(heldPair, pair, [buy, gone])).toMatchObject({ target_id: buy.id });
  });

  it("seals the ids of a redo before recording it, keeps them when started again, and knows it recorded by those exact ids only", () => {
    const records = holdRecords(linesOf([deposit]), "client", duplicate.reason, "t");
    const started = sealedUnit(records, [deposit], ids("01ARYZ6S41TSV4RRFFQ69ZZZZZ"));
    const again = startRedoPlan(started, [deposit], new Set(), [], ids("01OTHER"), "t");
    expect(again).toMatchObject({ plan: { id: "01ARYZ6S41TSV4RRFFQ69ZZZZZ" }, records: [] });
    expect(redoneLines(started, [deposit], [deposit])).toEqual([]);
    expect(
      redoneLines(started, [deposit], [{ ...deposit, id: "01ARYZ6S41TSV4RRFFQ69ZZZZZ" } as never]),
    ).toEqual(linesOf([deposit]));
    expect(redoneLines(duplicate, [deposit], [deposit])).toEqual([]);
    const finished = redoFinished(started, started.lines, "t");
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

describe("finding what is held back", () => {
  it("names a unit by its id, and refuses one that is not there", async () => {
    const { heldUnitById, assertRedoRecorded } = await import("../../src/sync/resolve.js");
    const units = unresolvedHeld(
      holdRecords(linesOf([deposit]), "client", { code: "new_duplicate", details: {} }, "t"),
    );
    expect(heldUnitById(units, units[0]?.unit as string)).toBe(units[0]);
    expect(() => heldUnitById(units, "nope")).toThrow(ValidationError);
    const started = sealedUnit(
      holdRecords(linesOf([deposit]), "client", { code: "new_duplicate", details: {} }, "t"),
      [deposit],
      ids("01ARYZ6S41TSV4RRFFQ69ZZZZZ"),
    ) as never;
    expect(() => assertRedoRecorded(started, [deposit], [deposit])).toThrow(ValidationError);
    expect(
      assertRedoRecorded(
        started,
        [deposit],
        [{ ...deposit, id: "01ARYZ6S41TSV4RRFFQ69ZZZZZ" } as LedgerEvent],
      ),
    ).toEqual(linesOf([deposit]));
    // Nothing sealed and nothing in the ledger: not recorded.
    expect(() => assertRedoRecorded(units[0] as never, [deposit], [])).toThrow(ValidationError);
  });
});

describe("redoing pairs and chains (B2 of the review of PR #83)", () => {
  const b2 = device(3000);
  const first = b2.deposit({ account_id: "acc_fund", amount: "11" });
  const second = b2.deposit({ account_id: "acc_fund", amount: "12" });
  const pair1 = correction(b2, first, { amount: "21" });
  const pair2 = correction(b2, second, { amount: "22" });
  const chain = [...pair1, ...pair2];
  const held = unresolvedHeld(
    holdRecords(linesOf(chain), "client", { code: "pair_rejected", details: {} }, "t"),
  )[0] as NonNullable<ReturnType<typeof unresolvedHeld>[number]>;

  it("plans a chain pair by pair, the first still held first, sealing only that pair", () => {
    const started = startRedoPlan(held, chain, new Set(), [], ids("R1", "C1"), "t");
    expect(started.plan).toMatchObject({ kind: "correct", target_id: first.id });
    expect(
      started.records.map((record) => record.kind === "redo_started" && record.event_id),
    ).toEqual(["R1", "C1"]);
  });

  it("finishes only the pairs recorded with their sealed ids; the rest stays held", async () => {
    const { assertRedoRecorded } = await import("../../src/sync/resolve.js");
    const records = holdRecords(linesOf(chain), "client", held.reason, "t");
    const sealed = sealedUnit(records, chain, ids("01REDOREVERSAL", "01REDOCORRECTION"));
    const redo = device(3100);
    const [reversal, corrected] = correction(redo, first, { amount: "21" });
    const redone = [
      { ...reversal, id: "01REDOREVERSAL" },
      { ...corrected, id: "01REDOCORRECTION" },
    ] as LedgerEvent[];
    expect(() => assertRedoRecorded(sealed, chain, [first, second])).toThrow(ValidationError);
    // A correction of the same target with other ids is not this redo (R1).
    expect(() =>
      assertRedoRecorded(sealed, chain, [
        first,
        second,
        reversal as LedgerEvent,
        corrected as LedgerEvent,
      ]),
    ).toThrow(expect.objectContaining({ code: "redo_not_recorded" }));
    // Only half of the pair recorded: not finished.
    expect(redoneLines(sealed, chain, [first, second, redone[0] as LedgerEvent])).toEqual([]);
    expect(assertRedoRecorded(sealed, chain, [first, second, ...redone])).toEqual(linesOf(pair1));
    const finished = redoFinished(sealed, linesOf(pair1), "t");
    expect(finished.discarded.map((record) => record.replaced_by)).toEqual([
      "01REDOREVERSAL",
      "01REDOCORRECTION",
    ]);
    expect(unresolvedHeld([...records, ...finished.records]).flatMap((unit) => unit.lines)).toEqual(
      linesOf(pair2),
    );
    // Nothing sealed: nothing is its redo, not even the held pair's own lines.
    expect(redoneLines(held, chain, [first, second, ...chain])).toEqual([]);
    // A lone reversal, by its sealed reversal only.
    const lone = redo.reversal(second.id);
    const loneRecords = holdRecords(
      linesOf([lone]),
      "client",
      { code: "domain_rejected", details: {} },
      "t",
    );
    const heldLone = sealedUnit(loneRecords, [lone], ids("01LONE"));
    expect(redoneLines(heldLone, [lone], [second, redo.reversal(second.id)])).toEqual([]);
    expect(
      redoneLines(
        heldLone,
        [lone],
        [second, { ...redo.reversal(second.id), id: "01LONE" } as never],
      ),
    ).toEqual(linesOf([lone]));
  });

  it("redoes a correction a rewrite left on its own as a correction, keeping what it corrects (NB5)", () => {
    const alone = unresolvedHeld(
      holdRecords(linesOf([pair1[1]]), "rewrite", { code: "rewritten", details: {} }, "t"),
    )[0] as typeof held;
    expect(planFor(alone, [pair1[1]])).toMatchObject({
      kind: "record",
      draft: { corrects_id: first.id },
    });
  });
});

describe("the ids a correction is recorded with", () => {
  it("gives the sealed reversal, then the sealed corrected event, and nothing more", () => {
    const heldPair = unresolvedHeld(
      holdRecords(linesOf(pair), "client", { code: "pair_rejected", details: {} }, "t"),
    )[0] as Unit;
    const plan = planFor(heldPair, pair);
    if (plan.kind !== "correct") {
      throw new Error("a pair is redone as a correction");
    }
    const ids = sealedIds(plan);
    expect([ids.next(), ids.next(), ids.next()]).toEqual([plan.reversal_id, plan.id, ""]);
  });
});

describe("the decisions of discarded.jsonl (second review of PR #83)", () => {
  it("names a decision by the resolution, the hold and the line: the same retried, another held again", () => {
    const line = linesOf([deposit])[0] as string;
    const first = unresolvedHeld(
      holdRecords([line], "client", { code: "new_duplicate", details: {} }, "t1"),
    )[0] as Unit;
    const again = unresolvedHeld(
      holdRecords([line], "client", { code: "new_duplicate", details: {} }, "t2"),
    )[0] as Unit;
    expect(discardHeld(first, "x").discarded[0]?.decision).toBe(
      discardHeld(first, "y").discarded[0]?.decision,
    );
    expect(decisionOf(first, line, "discarded_by_user")).not.toBe(
      decisionOf(again, line, "discarded_by_user"),
    );
    expect(decisionOf(first, line, "discarded_by_user")).not.toBe(
      decisionOf(first, line, "redone"),
    );
  });
});
