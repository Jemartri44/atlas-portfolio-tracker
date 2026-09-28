// What the jobs and the web read of `reference/ecb/manifest.json` (ADR-0029, third
// amendment, point 2): which file is in force, from which source, and its
// SHA-256. Read strictly: a manifest that does not say it, or names a file
// that is not one of the two of the ECB, gives no history — and a file whose
// bytes do not match its SHA-256 is never used as if it did (`EcbHistoryDamaged`).

import { repeatedKey } from "../schema/json-keys.js";
import type { EcbSource } from "./history.js";

type Plain = Record<string, unknown>;

/** A plain object: never an array, never one with a prototype that finds `__proto__`. */
const isPlainObject = (value: unknown): value is Plain =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

/**
 * The manifest as a JSON object, or nothing: not JSON, a repeated key, a lone
 * surrogate, not an object. The same rule as the jobs' `strictJsonObject`,
 * written here because the web reads this file and never reaches the jobs.
 */
const manifestObject = (text: string): Plain | undefined => {
  // A lone surrogate: its UTF-8 would not be UTF-8. Written here, not
  // imported, so the lazy chunk of the ECB asks the boot for nothing new.
  if (/\p{Cs}/u.test(text)) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  return isPlainObject(value) && repeatedKey(text) === undefined ? value : undefined;
};

export interface ActiveHistory {
  readonly file: "eurofxref-hist.csv" | "api-exr.csv";
  readonly source: EcbSource;
  readonly sha256: string;
}

const FILE_OF: Readonly<Record<EcbSource, ActiveHistory["file"]>> = {
  zip: "eurofxref-hist.csv",
  api: "api-exr.csv",
};

export const activeHistoryOf = (manifestText: string): ActiveHistory | undefined => {
  const active = manifestObject(manifestText)?.active;
  if (!isPlainObject(active)) {
    return undefined;
  }
  const { file, source, sha256 } = active;
  return (source === "zip" || source === "api") &&
    file === FILE_OF[source] &&
    typeof sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(sha256)
    ? { file: FILE_OF[source], source, sha256 }
    : undefined;
};

export interface PreviousHistory {
  readonly file: "previous/eurofxref-hist.csv" | "previous/api-exr.csv";
  readonly source: EcbSource;
  readonly sha256: string;
}

/**
 * The history a manifest names as **the one it replaced** (`previous`), with
 * the SHA-256 its bytes must have — or nothing, when the manifest does not
 * read or names none. **Whoever uses `previous/` checks its bytes against
 * this first** (N3 of the review of PR #106): a cut between the first two
 * steps of an activation leaves in `previous/` other bytes than the ones the
 * manifest records, and those were never verified as a generation.
 */
export const previousHistoryOf = (manifestText: string): PreviousHistory | undefined => {
  const manifest = manifestObject(manifestText);
  if (manifest === undefined || activeHistoryOf(manifestText) === undefined) {
    return undefined;
  }
  const previous = manifest.previous;
  if (!isPlainObject(previous)) {
    return undefined;
  }
  const { file, source, sha256 } = previous;
  return (source === "zip" || source === "api") &&
    file === `previous/${FILE_OF[source]}` &&
    typeof sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(sha256)
    ? { file: `previous/${FILE_OF[source]}`, source, sha256 }
    : undefined;
};
