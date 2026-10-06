// The name of the archive the restore of the remote leaves (ADR-0032, step 5):
// the bytes of the cloud's ledger before `atlas admin restore` replaces them.
// Date and time in Europe/Madrid, plus the start of the etag of what is
// archived, so two archives of the same second are still two names.

const MADRID = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const stamp = (now: Date): string => {
  const parts = Object.fromEntries(
    MADRID.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
};

/**
 * `pre-restore-2026-10-03T100000-0123456789ab.jsonl`. An archive is never
 * overwritten: when the name is taken the store refuses with
 * `ArchiveExistsError`.
 */
export const syncArchiveName = (kind: "restore", now: Date, etag: string): string =>
  `pre-${kind}-${stamp(now)}-${etag.slice(0, 12)}.jsonl`;
