// `job_frequencies` (feature 016, §8.1 P5; `docs/specification.md` §9.5): how
// often each scheduled job runs, configured from the interface without
// touching Terraform. EventBridge Scheduler wakes each function once a day,
// and the domain says whether a job is due (`jobs/due` through the catalog).
//
// **A closed set of keys and values.** Read **tolerantly**: an unknown key, a
// value not admitted or a map that is not one does not invalidate the ledger
// (hardening the loader is not allowed, ADR-0018); the default is used and
// what was ignored **is said**, with its own code. Written **strictly**: a
// form may only write what `validJobFrequencies` accepts. There is no `off`:
// switching a warning off is silencing an alarm (constitution IV), and the
// monthly reminder always arrives (constitution V).
//
// Kept outside `jobs/`: the web will read it to say, in Ajustes, what a
// ledger line carries that the jobs ignore, without reaching the jobs.

export type JobFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

/** Each key with the values it admits; **the first one is the default**. */
export const JOB_FREQUENCY_KEYS = {
  ecb: ["daily", "weekly"],
  prices: ["daily", "weekly"],
  reminder: ["monthly"],
  backup: ["monthly"],
  integrity: ["quarterly", "monthly"],
  review: ["weekly", "monthly"],
  tax_return: ["yearly"],
  informative_thresholds: ["yearly"],
} as const satisfies Record<string, readonly JobFrequency[]>;

export type JobFrequencyKey = keyof typeof JOB_FREQUENCY_KEYS;

/**
 * Keys that belong to jobs of Round 6 (the importers), not built yet. The
 * synthetic generator writes `reconciliation` (it is in the golden), so it is
 * said apart from a key nobody knows.
 */
export const RESERVED_JOB_KEYS: readonly string[] = ["reconciliation"];

export type IgnoredFrequencyCode =
  | "job_frequencies_invalid"
  | "job_not_available"
  | "job_frequency_unknown_key"
  | "job_frequency_invalid_value";

export interface IgnoredFrequency {
  readonly code: IgnoredFrequencyCode;
  /** The key, when it is one of ours or looks like one; never free text of any length. */
  readonly key?: string;
}

export interface JobFrequencies {
  readonly frequencies: Readonly<Record<JobFrequencyKey, JobFrequency>>;
  readonly ignored: readonly IgnoredFrequency[];
}

const KEY_SHAPE = /^[a-z][a-z0-9_]{0,31}$/;

const isKnownKey = (key: string): key is JobFrequencyKey => Object.hasOwn(JOB_FREQUENCY_KEYS, key);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

const defaults = (): Record<JobFrequencyKey, JobFrequency> =>
  Object.fromEntries(
    Object.entries(JOB_FREQUENCY_KEYS).map(([key, values]) => [key, values[0]]),
  ) as Record<JobFrequencyKey, JobFrequency>;

const admits = (key: JobFrequencyKey, value: unknown): value is JobFrequency =>
  (JOB_FREQUENCY_KEYS[key] as readonly unknown[]).includes(value);

/** The tolerant reading: defaults for what is missing or not understood, and what was ignored. */
export const readJobFrequencies = (raw: unknown): JobFrequencies => {
  const frequencies = defaults();
  if (raw === undefined) {
    return { frequencies, ignored: [] };
  }
  if (!isPlainObject(raw)) {
    return { frequencies, ignored: [{ code: "job_frequencies_invalid" }] };
  }
  const ignored: IgnoredFrequency[] = [];
  for (const key of Object.keys(raw).sort()) {
    const shown = KEY_SHAPE.test(key) ? { key } : {};
    if (!isKnownKey(key)) {
      // Each code written whole, so the guard of the messages sees both.
      ignored.push(
        RESERVED_JOB_KEYS.includes(key)
          ? { code: "job_not_available", ...shown }
          : { code: "job_frequency_unknown_key", ...shown },
      );
      continue;
    }
    const value = raw[key];
    if (admits(key, value)) {
      frequencies[key] = value;
    } else {
      ignored.push({ code: "job_frequency_invalid_value", key });
    }
  }
  return { frequencies, ignored };
};

/** The strict writing: only a map of known keys with admitted values. */
export const validJobFrequencies = (
  raw: unknown,
): raw is Partial<Record<JobFrequencyKey, JobFrequency>> =>
  isPlainObject(raw) &&
  Object.entries(raw).every(([key, value]) => isKnownKey(key) && admits(key, value));
