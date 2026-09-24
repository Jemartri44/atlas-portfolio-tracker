// The root of a correction chain (decision of the direction on the adversarial
// review of PR #75, feature 012).
//
// A correction (`corrects_id`) is **the same economic fact** as the event it
// corrects, and a correction of a correction is still that fact. Its root is
// the first event of the chain: follow `corrects_id` until an event that
// corrects nothing. Two rules of the projection read it, and read it from here
// so that they cannot disagree about what a chain is:
//
// - **at most one live correction per root** (ADR-0026, Part C), judged in
//   file order — per `corrects_id` alone, `O, R(O), C1→O, R(C1), C2→C1, C3→O`
//   let two live corrections of O through;
// - **the place of the fact in the file is the root's**: the FIFO tie-break
//   between lots of the same date, and the order of operations of the same
//   business date, use the position of the root, not the one of the
//   correction, which is appended at the end of the file. Correcting a rate
//   must not change which lot a sale consumes.

import type { Ulid } from "../ids/ulid.js";
import type { LedgerEvent } from "../schema/events.js";

/** The root of every event of the file: itself when it corrects nothing. */
export const correctionRoots = (events: readonly LedgerEvent[]): ReadonlyMap<Ulid, Ulid> => {
  const corrects = new Map<Ulid, Ulid | undefined>(
    events.map((event) => [event.id, event.corrects_id]),
  );
  const roots = new Map<Ulid, Ulid>();
  const rootOf = (id: Ulid): void => {
    const path: Ulid[] = [];
    const onPath = new Set<Ulid>();
    let current = id;
    for (;;) {
      const cached = roots.get(current);
      if (cached !== undefined) {
        for (const member of path) {
          roots.set(member, cached);
        }
        return;
      }
      if (onPath.has(current)) {
        // A loop (`A→B, B→A`) can only come from a file edited by hand and
        // has no first event: each member is its own root. What the
        // projection does with it depends on the reversals in the file (none:
        // dangling corrections; both: nothing is rejected and both are
        // inactive). A correction of a loop member gets that member's root
        // only if the member comes first in the file; otherwise its own.
        for (const member of path) {
          roots.set(member, member);
        }
        return;
      }
      path.push(current);
      onPath.add(current);
      const next = corrects.get(current);
      if (next === undefined || !corrects.has(next)) {
        // The first event of the chain — or a correction of something that
        // is not in the file, which starts a chain of its own.
        for (const member of path) {
          roots.set(member, current);
        }
        return;
      }
      current = next;
    }
  };
  for (const event of events) {
    rootOf(event.id);
  }
  return roots;
};
