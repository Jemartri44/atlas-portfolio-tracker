import { describe, expect, it } from "vitest";
import { entriesOf, unitsOf } from "../../src/sync/units.js";
import { baseLedger, correction, device, linesOf } from "./helpers.js";

describe("the units of a queue", () => {
  const { events } = baseLedger();
  const buy = events[events.length - 1] as Parameters<typeof correction>[1];

  it("makes a pair of a reversal right before its correction, and a chain of two or more (P1, D-Q2)", () => {
    const b = device(100);
    const deposit = b.deposit({ account_id: "acc_fund" });
    const pair = correction(b, buy, { fee: "1" } as never);
    const lone = b.reversal(deposit.id);
    const queue = b.build();
    const units = unitsOf(linesOf(queue), queue);
    expect(units.map((unit) => [unit.kind, unit.start, unit.lines.length])).toEqual([
      ["line", 0, 1],
      ["pair", 1, 2],
      ["line", 3, 1],
    ]);
    expect(units[1]?.events).toEqual(pair);
    expect(units[2]?.events).toEqual([lone]);

    const c = device(200);
    const a1 = c.deposit({ account_id: "acc_fund" });
    const a2 = c.deposit({ account_id: "acc_fund", amount: "7" });
    const a3 = c.deposit({ account_id: "acc_fund", amount: "8" });
    correction(c, a1, { amount: "2" });
    correction(c, a2, { amount: "3" });
    correction(c, a3, { amount: "4" });
    const chainQueue = c.build().slice(3);
    const [chain] = unitsOf(linesOf(chainQueue), chainQueue);
    expect(chain?.kind).toBe("chain");
    expect(chain?.lines).toHaveLength(6);
  });

  it("leaves a correction not right after the reversal of its target as a detached line (P7)", () => {
    const b = device(300);
    const [reversal, corrected] = correction(b, buy, { fee: "1" } as never);
    const other = b.deposit({ account_id: "acc_fund" });
    const queue = [reversal, other, corrected];
    const units = unitsOf(linesOf(queue), queue);
    expect(units.map((unit) => [unit.kind, unit.detached ?? false])).toEqual([
      ["line", false],
      ["line", false],
      ["line", true],
    ]);
  });

  it("declares a pair and the continuation of a chain as the client uploads them", () => {
    const c = device(400);
    const a1 = c.deposit({ account_id: "acc_fund" });
    const a2 = c.deposit({ account_id: "acc_fund", amount: "7" });
    correction(c, a1, { amount: "2" });
    correction(c, a2, { amount: "3" });
    const queue = c.build().slice(2);
    const [chain] = unitsOf(linesOf(queue), queue);
    const entries = entriesOf(chain as NonNullable<typeof chain>, (index) => index === 1);
    expect(entries.map(({ line: _line, ...flags }) => flags)).toEqual([
      { has_correction: true },
      { confirm_duplicate: true, chain_continues: true },
      { has_correction: true },
      {},
    ]);
    const [single] = unitsOf([linesOf(queue)[0] as string], [queue[0] as never]);
    expect(entriesOf(single as NonNullable<typeof single>, () => false)).toEqual([
      { line: linesOf(queue)[0] },
    ]);
  });
});
