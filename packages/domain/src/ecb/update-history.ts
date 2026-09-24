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
import { asciiText, type EcbHistory, readEcbHistory } from "./history.js";
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
