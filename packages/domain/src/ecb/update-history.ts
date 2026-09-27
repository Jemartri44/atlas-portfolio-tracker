// Updating the stored ECB history from its source (ADR-0029, points 1-3 and 6).
//
// **Fail safe** (constitution V): a download that fails, or bytes that cannot
// be read as a history, leave the stored file exactly as it was — the read
// happens before anything is written. A download that reads but contradicts
// what was published is **kept apart** and the previous history stays in
// force (decision (o)); saying so is the result, not an exception. The TARGET
// calendar is compared in the years the ledger uses and only warns.

import type { CivilDate } from "../dates/civil-date.js";
import type {
  DownloadedHistory,
  EcbHistoryStore,
  FxRateSource,
  StoredHistoryMeta,
} from "../ports/fx-rate-source.js";
import { asciiText, type EcbHistory, type EcbSource, readEcbHistory } from "./history.js";
import { type CalendarDisagreement, calendarYears, crossCheckCalendar } from "./target.js";
import { checkHistoryUpdate, type HistoryConflict } from "./update.js";

export type EcbUpdateResult =
  | {
      kind: "accepted";
      stored: StoredHistoryMeta;
      /** Days of publication added to the previous history (all of them, the first time). */
      newDays: number;
      latest: CivilDate;
      zip_failure?: string;
      /** Where the TARGET calendar and the history disagree, in the years of the ledger: a warning. */
      calendar: CalendarDisagreement[];
    }
  | {
      kind: "rejected";
      kept: StoredHistoryMeta;
      /** The one that stays in force. */
      active: StoredHistoryMeta;
      conflicts: HistoryConflict[];
      total: number;
      zip_failure?: string;
    };

const read = (downloaded: DownloadedHistory): EcbHistory =>
  readEcbHistory(asciiText(downloaded.bytes), downloaded.source);

export const updateEcbHistory = async (
  deps: { source: FxRateSource; store: EcbHistoryStore },
  options: { firstRateDate: CivilDate | undefined; today: CivilDate },
): Promise<EcbUpdateResult> => {
  const downloaded = await deps.source.download();
  const next = read(downloaded);
  const current = await deps.store.active();
  const previous =
    current === undefined ? undefined : readEcbHistory(current.text, current.meta.source);
  const check = checkHistoryUpdate(previous, next);
  const failure =
    downloaded.zip_failure === undefined ? {} : { zip_failure: downloaded.zip_failure };
  if (check.kind === "rejected") {
    const kept = await deps.store.keepRejected(downloaded);
    return {
      kind: "rejected",
      kept,
      active: (current as { meta: StoredHistoryMeta }).meta,
      conflicts: check.conflicts,
      total: check.total,
      ...failure,
    };
  }
  const stored = await deps.store.activate(downloaded);
  return {
    kind: "accepted",
    stored,
    newDays: check.newDays,
    latest: check.latest,
    ...failure,
    calendar: crossCheckCalendar(next, calendarYears(options.firstRateDate, options.today)),
  };
};

/** A generation of the history left in the bucket, as its text and the source its name says. */
export interface EcbGeneration {
  readonly text: string;
  readonly source: EcbSource;
}

/**
 * What rewrites a history in force that is **damaged** — its file does not
 * match its manifest and `previous/` cannot undo it (review of PR #106, B1):
 * the download becomes the only history in force, over whatever is there,
 * with conditional writes. Only the store of the cloud has it.
 */
export interface EcbHistoryRebuilder {
  /**
   * The generations left, newest first: the file in force as it is (its bytes
   * do not match the manifest, but may still read as a history), then
   * `previous/` (round 2 of the review of PR #106, R2-N1).
   */
  generations(): Promise<readonly EcbGeneration[]>;
  rebuild(next: DownloadedHistory): Promise<StoredHistoryMeta>;
}

export type EcbRebuildResult =
  | {
      kind: "rebuilt";
      stored: StoredHistoryMeta;
      /** Days of publication of the rebuilt history: all of them. */
      days: number;
      latest: CivilDate;
      calendar: CalendarDisagreement[];
      /**
       * Whether it was compared with a readable generation (ADR-0029, point 2).
       * `false` only when nothing left could be read: accepted, and said.
       */
      verified: boolean;
    }
  | {
      /** The ZIP contradicts the last readable generation: nothing is written. */
      kind: "rejected";
      conflicts: HistoryConflict[];
      total: number;
    }
  | {
      /** The download came from the API: nothing is rebuilt from it. */
      kind: "zip_unavailable";
      zip_failure?: string;
    };

/** The first generation that still reads as a history, or nothing. */
const lastReadable = (generations: readonly EcbGeneration[]): EcbHistory | undefined => {
  for (const generation of generations) {
    try {
      return readEcbHistory(generation.text, generation.source);
    } catch {
      // Not a history (a `ValidationError`): the next generation is tried.
    }
  }
  return undefined;
};

/**
 * Rebuilds a damaged history **from the official ZIP of the ECB only**, the
 * source of truth, which anyone can download again and compare: never from
 * the API. **The comparison of ADR-0029, point 2, still applies** (round 2 of
 * the review of PR #106, R2-N1; note of ADR-0029 of 2026-09-28): against the
 * last generation that still reads — the file in force as it is, else
 * `previous/` — and a ZIP that changes or drops a rate of it is **not**
 * activated. Only when nothing left reads is the ZIP accepted unverified,
 * and that is said. A ZIP that does not read as a history writes nothing.
 */
export const rebuildEcbHistory = async (
  deps: { source: FxRateSource; store: EcbHistoryRebuilder },
  options: { firstRateDate: CivilDate | undefined; today: CivilDate },
): Promise<EcbRebuildResult> => {
  const downloaded = await deps.source.download();
  if (downloaded.source !== "zip") {
    return {
      kind: "zip_unavailable",
      ...(downloaded.zip_failure === undefined ? {} : { zip_failure: downloaded.zip_failure }),
    };
  }
  const next = read(downloaded);
  const previous = lastReadable(await deps.store.generations());
  const check = checkHistoryUpdate(previous, next);
  if (check.kind === "rejected") {
    return { kind: "rejected", conflicts: check.conflicts, total: check.total };
  }
  const stored = await deps.store.rebuild(downloaded);
  return {
    kind: "rebuilt",
    stored,
    days: next.publications.length,
    latest: check.latest,
    calendar: crossCheckCalendar(next, calendarYears(options.firstRateDate, options.today)),
    verified: previous !== undefined,
  };
};
