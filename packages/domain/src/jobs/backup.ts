// The monthly dump (feature 016, E4; ADR-0032, point 3; plan §8): what goes
// into `backups/<YYYY-MM>/` and what happens to each object, decided here.
// **A dump is for ever**: every object is written with `If-None-Match: *` and
// never overwritten (ADR-0006), and the bucket policy denies a write to
// `backups/*` without that condition (questions §20.1).
//
// Only the backup function writes `backups/`, so an object already there with
// other bytes than the ones it was going to write is either **what an earlier
// attempt of the same month left** — the ledger grew between two attempts,
// say — and stays (`kept`), or something nobody should have written, which is
// refused and said (`backup_object_differs`) with nothing more written.

import type { Finding } from "./run-record.js";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `backups/<YYYY-MM>/`, the month of Madrid of the dump. */
export const dumpPrefix = (period: string): string => {
  if (!MONTH.test(period)) {
    throw new RangeError("a dump is of a month");
  }
  return `backups/${period}/`;
};

/** The bytes of the remote ledger, as they are. */
export const DUMP_LEDGER = "ledger.jsonl";
/** The valued projection of that ledger (`positions.ts`). */
export const DUMP_POSITIONS = "positions.json";

/**
 * Whether a name of the first level of `prices/` goes into the dump: a plain
 * name, never a way out of the folder (§5, family 7). The listing of S3 is
 * what the outside says.
 */
export const dumpablePriceName = (name: string): boolean =>
  /^[A-Za-z0-9._%-]{1,255}$/.test(name) && name !== "." && name !== "..";

export type DumpStep = "write" | "same" | "kept" | "differs";

/**
 * What to do with one object of the dump, from the SHA-256 of what is there
 * (if anything) and of what was going to be written. `retrying`: an earlier
 * attempt of the same month exists.
 */
export const dumpStep = (input: {
  readonly existing: string | undefined;
  readonly next: string;
  readonly retrying: boolean;
}): DumpStep => {
  if (input.existing === undefined) {
    return "write";
  }
  if (input.existing === input.next) {
    return "same";
  }
  return input.retrying ? "kept" : "differs";
};

/**
 * The manifest of the ECB goes into the dump **only over the file it names**:
 * a file the dump already holds from an earlier attempt, of another
 * generation, would sit under a manifest that is not its own.
 */
export const dumpManifestStep = (input: {
  readonly fileInDump: string | undefined;
  readonly manifestSha256: string;
}): "write" | "inconsistent" =>
  input.fileInDump === input.manifestSha256 ? "write" : "inconsistent";

/** What a dump leaves for the mail: only what failed (§9.5, «solo si falla»). */
export const backupFindings = (input: {
  readonly differs: number;
  readonly ecbInconsistent: boolean;
  /** The ledger of the dump does not project cleanly: no `positions.json` was written. */
  readonly positionsMissing: boolean;
}): Finding[] => [
  ...(input.differs === 0
    ? []
    : [
        {
          code: "backup_object_differs",
          subject: "backup",
          counts: { objects: input.differs },
        },
      ]),
  ...(input.ecbInconsistent ? [{ code: "backup_ecb_inconsistent", subject: "backup" }] : []),
  ...(input.positionsMissing ? [{ code: "backup_positions_missing", subject: "backup" }] : []),
];
