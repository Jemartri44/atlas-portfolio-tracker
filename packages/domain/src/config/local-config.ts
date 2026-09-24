// The local configuration of a ledger folder, `atlas.config.json` (feature 012,
// decision (j) of its prompt).
//
// **Outside the ledger on purpose.** These values change no fiscal figure: the
// engine always computes with the `fx_rate` of the ledger. One decides whether
// there is an official rate *to propose* for a currency the ECB stopped
// publishing; the other, when the message about a held lock says that it is
// probably abandoned. Putting them in `settings_changed` would add a field to a
// full-state event, which ADR-0018 (amended) forbids without a new schema
// version, and a warning threshold does not justify one. If a value here ever
// moved a figure, it would not belong here.
//
// A missing file is the defaults; a file that cannot be read, or that says
// something this code does not understand, is an error, never a silent default
// (constitution V).

import { ValidationError } from "../errors.js";

export interface LocalConfig {
  /**
   * Days after which a currency whose last ECB value is older has **no
   * official rate to propose**: a currency the ECB stopped publishing (the lev
   * stopped on 2025-12-31, when Bulgaria joined the euro).
   */
  readonly ecb_stale_currency_days: number;
  /** Minutes after which a held lock is described as probably abandoned. Informative only. */
  readonly lock_stale_minutes: number;
}

/** The documented defaults. */
export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  ecb_stale_currency_days: 30,
  lock_stale_minutes: 10,
};

export const LOCAL_CONFIG_FILE = "atlas.config.json";

const KEYS = Object.keys(DEFAULT_LOCAL_CONFIG) as (keyof LocalConfig)[];

/** Parses the text of `atlas.config.json`; every key is optional. */
export const parseLocalConfig = (text: string): LocalConfig => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ValidationError("invalid_local_config", "atlas.config.json is not valid JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ValidationError("invalid_local_config", "atlas.config.json must be an object");
  }
  const values = new Map<string, number>();
  for (const [key, value] of Object.entries(raw)) {
    if (!(KEYS as string[]).includes(key)) {
      throw new ValidationError("invalid_local_config", `unknown key ${key} in atlas.config.json`, {
        field: key,
      });
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      throw new ValidationError("invalid_local_config", `${key} must be a positive whole number`, {
        field: key,
        value,
      });
    }
    values.set(key, value);
  }
  return {
    ecb_stale_currency_days:
      values.get("ecb_stale_currency_days") ?? DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days,
    lock_stale_minutes: values.get("lock_stale_minutes") ?? DEFAULT_LOCAL_CONFIG.lock_stale_minutes,
  };
};
