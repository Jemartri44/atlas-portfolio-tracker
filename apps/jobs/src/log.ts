// The log of the jobs (`docs/specification.md` §11.7; feature 016, §2 bis):
// one JSON line per job and period, with the `request_id` of the invocation,
// **its name, its period and its result with a code and counts, and nothing
// else**. Never a recipient, a sender, the subject or the body of a mail, an
// amount, a position, an account, an `asset_id`, a symbol, an ISIN, a key of a
// source, a token, a mail address or a `sub` — and never the message of a
// foreign error (the SDK, `fetch`, `JSON.parse`, SES), only its name. The
// fields are a closed list, and a value that is not one of ours does not get in.

export interface JobLogEntry {
  readonly level: "INFO" | "WARN" | "ERROR";
  readonly request_id: string;
  /** The task, or `event` / `startup` for what comes before any task. */
  readonly job: string;
  readonly period?: string;
  readonly code: string;
  /** One of our own short reasons. */
  readonly reason?: string;
  /** The class of an unexpected error: its name, never its message. */
  readonly error_name?: string;
  /** Counts of the result: numbers only. */
  readonly counts?: Readonly<Record<string, number>>;
}

const SAFE = /^[A-Za-z0-9_.-]{1,64}$/;

const safeCounts = (
  counts: Readonly<Record<string, number>> | undefined,
): Record<string, number> | undefined => {
  if (counts === undefined) {
    return undefined;
  }
  const kept = Object.entries(counts).filter(
    ([key, value]) => /^[a-z][a-z0-9_]{0,63}$/.test(key) && Number.isInteger(value),
  );
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
};

export const logLine = (entry: JobLogEntry): string => {
  const { counts, ...rest } = entry;
  const kept = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => typeof value === "string" && SAFE.test(value)),
  );
  const numbers = safeCounts(counts);
  return JSON.stringify(numbers === undefined ? kept : { ...kept, counts: numbers });
};

/** The name of an unexpected error, or `unknown`: never its message. */
export const errorName = (error: unknown): string =>
  error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : "unknown";
