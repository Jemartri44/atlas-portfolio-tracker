// The units a queue is made of (ADR-0026, second and third amendments; §6.2 P1
// and P7 of prompt 014): a line, a **pair** — a reversal immediately followed
// by the line whose `corrects_id` is what it reverses —, or a **chain** of
// rate corrections. A unit is uploaded whole or not at all, and counts as one
// line for the rule that stops at the first failure.
//
// **How a chain is recognised** (plan §9, decision D-Q2): every contiguous run
// of two or more pairs is a chain. The ledger does not record which lines were
// written together; `writeRateCorrections` writes its pairs contiguously in
// one write, so a real chain is never split. Two independent corrections
// recorded one after the other look the same and are treated as one chain:
// the rule retains too much, never too little.

import type { AppendEntry } from "../ports/remote-ledger.js";
import type { LedgerEvent } from "../schema/events.js";

export type UnitKind = "line" | "pair" | "chain";

export interface QueueUnit {
  readonly kind: UnitKind;
  /** Index of its first line in the queue. */
  readonly start: number;
  readonly lines: readonly string[];
  readonly events: readonly LedgerEvent[];
  /**
   * A correction that does not come right after the reversal of its target
   * (P7). It is a unit of its own, and it is held back as it is.
   */
  readonly detached?: true;
}

const correctsOf = (event: LedgerEvent): string | undefined =>
  (event as { corrects_id?: string }).corrects_id;

/** Whether `events[index]` and the next one are a reversal and its correction. */
const pairAt = (events: readonly LedgerEvent[], index: number): boolean => {
  const reversal = events[index];
  const next = events[index + 1];
  return (
    reversal !== undefined &&
    next !== undefined &&
    reversal.type === "reversal" &&
    correctsOf(next) === reversal.reverses_id
  );
};

/** Splits a queue into its units, in order. `lines[i]` is the raw text of `events[i]`. */
export const unitsOf = (lines: readonly string[], events: readonly LedgerEvent[]): QueueUnit[] => {
  const units: QueueUnit[] = [];
  let index = 0;
  while (index < events.length) {
    let end = index;
    while (pairAt(events, end)) {
      end += 2;
    }
    if (end > index) {
      const pairs = (end - index) / 2;
      units.push({
        kind: pairs === 1 ? "pair" : "chain",
        start: index,
        lines: lines.slice(index, end),
        events: events.slice(index, end),
      });
      index = end;
      continue;
    }
    const event = events[index] as LedgerEvent;
    units.push({
      kind: "line",
      start: index,
      lines: [lines[index] as string],
      events: [event],
      ...(correctsOf(event) === undefined ? {} : { detached: true as const }),
    });
    index += 1;
  }
  return units;
};

/**
 * The entries of a unit as the client uploads it (`docs/api.md` §5.2): the
 * reversal of a pair declares its correction, and the correction of every
 * pair but the last of a chain declares that the chain continues.
 */
export const entriesOf = (unit: QueueUnit, confirmed: (index: number) => boolean): AppendEntry[] =>
  unit.lines.map((line, index) => {
    const paired = unit.kind !== "line";
    const reversal = paired && index % 2 === 0;
    const continues = unit.kind === "chain" && index % 2 === 1 && index < unit.lines.length - 1;
    return {
      line,
      ...(confirmed(index) ? { confirm_duplicate: true as const } : {}),
      ...(reversal ? { has_correction: true as const } : {}),
      ...(continues ? { chain_continues: true as const } : {}),
    };
  });
