// The name of the archive a sync leaves when it moves lines (ADR-0026, Part B,
// step 6; decision D-Q12): the local bytes before a sync that reorders, before
// joining from the remote and before downloading a rewritten remote again.
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
 * `pre-sync-2026-09-25T061200-0123456789ab.jsonl` and its two siblings. An
 * archive is never overwritten: when the name is taken — a write cut after
 * archiving and retried within the same second —, `-2`, `-3`… as `compact`
 * does.
 */
export const syncArchiveName = (
  kind: "sync" | "join" | "redownload",
  now: Date,
  etag: string,
  attempt = 1,
): string =>
  `pre-${kind}-${stamp(now)}-${etag.slice(0, 12)}${attempt === 1 ? "" : `-${attempt}`}.jsonl`;
