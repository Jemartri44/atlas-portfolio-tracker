// What any HTTP client of our API accepts of an answer, whatever it asks for
// (feature 016, E3; review of PR #108, N3): an error of the closed list of
// `docs/api.md` §7, and the index of the reference data (§6). **Neutral**:
// neither of the sync nor of the jobs, so that the client of the reference
// data — which the web reaches outside the engine of the sync — never
// reaches the door of the sync. The sync re-exports what it uses.

import { isRecord } from "../guards.js";
import { REMOTE_FAILURE_CODES } from "../ports/remote-ledger.js";

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const onlyKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

/** The codes only the client names, for what never reached the API: never read from an answer. */
const CLIENT_ONLY = new Set(["transport_rejected", "network_failed"]);

/** An error of §7 of the closed list, or nothing (then the answer is `transport_rejected`). */
export const parseErrorAnswer = (
  value: unknown,
): { code: string; details: Record<string, unknown> } | undefined => {
  if (!isRecord(value) || !onlyKeys(value, ["error"]) || !isRecord(value.error)) {
    return undefined;
  }
  const { error } = value;
  if (
    !onlyKeys(error, ["code", "details"]) ||
    typeof error.code !== "string" ||
    CLIENT_ONLY.has(error.code) ||
    !(REMOTE_FAILURE_CODES as readonly string[]).includes(error.code) ||
    !isRecord(error.details)
  ) {
    return undefined;
  }
  return { code: error.code, details: error.details };
};

/** One entry of the index of the reference data (`docs/api.md` §6). */
export interface ReferenceIndexEntry {
  readonly name: string;
  readonly version: string;
  readonly size: number;
}

const isEntry = (value: unknown): value is ReferenceIndexEntry =>
  isRecord(value) &&
  onlyKeys(value, ["name", "version", "size"]) &&
  typeof value.name === "string" &&
  value.name !== "" &&
  typeof value.version === "string" &&
  value.version !== "" &&
  isCount(value.size);

/**
 * The `200` of `GET /api/reference/index` (feature 016, E3): the first level
 * of `reference/ecb/` and of `prices/`, each entry with its opaque version.
 */
export const parseReferenceIndex = (
  value: unknown,
): { ecb: ReferenceIndexEntry[]; prices: ReferenceIndexEntry[] } | undefined =>
  isRecord(value) &&
  onlyKeys(value, ["ecb", "prices"]) &&
  Array.isArray(value.ecb) &&
  Array.isArray(value.prices) &&
  value.ecb.every(isEntry) &&
  value.prices.every(isEntry)
    ? { ecb: value.ecb, prices: value.prices }
    : undefined;
