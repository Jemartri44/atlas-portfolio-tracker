// The two ways of starting (ADR-0026, Part B, "edge cases"; §6.3 (V6), (V7)
// and (V17)): the first device initialises an empty remote with the whole
// bytes of its ledger; a device that joins with a ledger of its own **chooses**
// between starting from the remote and uploading its lines as pending. And
// going back to the remote after a rewrite. Nothing here merges on its own.

import type { DomainError } from "../errors.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { LedgerEvent } from "../schema/events.js";
import { type HeldRecord, holdRecords } from "./held.js";
import type { Refusal } from "./permission.js";
import { classifyAgainst } from "./rewrite.js";
import { unitsOf } from "./units.js";

/** The events of a ledger that are invalid now, with their code. */
const invalidOf = (events: readonly LedgerEvent[]): { id: string; code: string }[] => {
  try {
    return projectLedger(events, { collectErrors: true }).invalid.map((entry) => ({
      id: entry.event.id,
      code: entry.error.code,
    }));
  } catch (error) {
    return [
      { id: String((error as DomainError).details.event_id), code: (error as DomainError).code },
    ];
  }
};

/**
 * What an initialisation finds in the remote (feature 015, E3; plan §7, S0
 * and S1): nothing yet; **exactly the bytes of this ledger** — an
 * initialisation cut after uploading, which only has to be finished —; or
 * anything else, which is joined, never initialised over. By the bytes, never
 * by resemblance.
 */
export const initState = (
  localLines: readonly string[],
  remoteText: string,
): "empty" | "same" | "other" => {
  if (remoteText === "") {
    return "empty";
  }
  return remoteText === localLines.map((line) => `${line}\n`).join("") ? "same" : "other";
};

/**
 * The client refuses to initialise **before calling** when its ledger is not
 * valid (a `settings_changed` recorded with `acceptInvalid` before the sync
 * was configured, any invalid event): the remote never receives an invalid
 * ledger, and an `init_rejected` must never be the normal path (V7).
 */
export const initRefusal = (events: readonly LedgerEvent[]): Refusal | undefined => {
  const invalid = invalidOf(events);
  return invalid.length > 0
    ? { code: "init_refused_invalid_ledger", details: { invalid } }
    : undefined;
};

/**
 * **Upload my lines as pending**: the local ledger becomes the remote followed
 * by every local line the remote does not have byte for byte, in their order;
 * the next sync re-applies them, and the fingerprint gives away those that
 * were already there. `invalid` warns of lines that will be held back when
 * they are re-applied (V7: said when the sync is configured).
 */
export const joinWithMine = (
  local: { readonly lines: readonly string[]; readonly events: readonly LedgerEvent[] },
  remote: readonly string[],
): { lines: string[]; synced: number; invalid: { id: string; code: string }[] } => {
  const theirs = new Set(remote);
  return {
    lines: [...remote, ...local.lines.filter((line) => !theirs.has(line))],
    synced: remote.length,
    invalid: invalidOf(local.events),
  };
};

/**
 * **Start from the remote**, when joining (decision D-Q5), and **download
 * again** after a rewrite (ADR-0026, Part A): the ledger becomes the remote
 * (the store archives the local bytes first), and **everything the device had
 * and the remote does not, or has with other content, is held back** —
 * pending or synced, never uploaded alone. Grouped as the queue is: a
 * reversal and its correction are held back as **one unit**, never split.
 */
export const replaceWithRemote = (
  local: { readonly lines: readonly string[]; readonly events: readonly LedgerEvent[] },
  remote: readonly LedgerEvent[],
  origin: "rewrite" | "join",
  at: string,
): HeldRecord[] => {
  const { absent, differs } = classifyAgainst(local, remote);
  const kept = new Set([...absent, ...differs]);
  const differing = new Set(differs);
  // In local order, grouped as the queue is: a reversal and its correction are
  // held back **as one unit**, never split (non-blocking 5 of the review of
  // PR #83), so neither can be redone or confirmed without the other.
  const lines = local.lines.filter((line) => kept.has(line));
  const events = local.events.filter((_event, index) => kept.has(local.lines[index] as string));
  // Four literals, each in its own place: what the remote lacks and what it
  // has otherwise are two different things to look at, and so are a rewrite
  // and a join.
  const reasons =
    origin === "join"
      ? {
          absent: { code: "absent_at_join", details: {} },
          differs: { code: "differs_at_join", details: {} },
        }
      : {
          absent: { code: "absent_after_rewrite", details: {} },
          differs: { code: "differs_after_rewrite", details: {} },
        };
  return unitsOf(lines, events).flatMap((unit) =>
    holdRecords(
      unit.lines,
      origin,
      unit.lines.some((line) => differing.has(line)) ? reasons.differs : reasons.absent,
      at,
    ),
  );
};
