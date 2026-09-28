// The closes the console takes from the cloud (feature 016, E3, block 1;
// §8.1 P7): in a folder synced with a remote whose cloud has prices, `atlas
// prices update` downloads them from the API and calls no source. What comes
// down is added to the local files **with the rules of the 013**, line by
// line of the cloud and keeping its `source` and `fetched_at`: a date with no
// close, a correction of the same source, or a source before the one in
// force. Never a byte of the local file rewritten.
//
// Which files it asks for comes from the index of the API and from what the
// folder keeps of the last pull, `prices/_cloud.json`: the version of each
// file, the origin it came from and when. Written by the console only, under
// the lock; never served and never uploaded.

import { ValidationError } from "../errors.js";
import type { QuoteSource } from "../projections/prices.js";
import type { AssetId } from "../schema/events.js";
import { repeatedKey } from "../schema/json-keys.js";
import { type CloseLine, linesToAppend, priceFileName } from "./line.js";
import { repeatedKeyError } from "./repeated-key.js";

export const CLOUD_PULL_FILE = "_cloud.json";
const CLOUD_PULL_FORMAT = 1;

/** What the folder keeps of its last pull from the cloud. */
export interface CloudPull {
  readonly cloud_format: 1;
  /** The origin of the API it came from: versions of another say nothing. */
  readonly origin: string;
  /** ISO 8601 UTC of the last pull. */
  readonly pulled_at: string;
  /** The version of each file of `prices/` as the index said it, by name. */
  readonly versions: Readonly<Record<string, string>>;
}

const invalid = (field: string): ValidationError =>
  new ValidationError("invalid_cloud_pull", `prices/${CLOUD_PULL_FILE}: ${field} is not valid`, {
    field,
  });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parses `prices/_cloud.json`, strictly; `undefined` (no file): the folder never pulled. */
export const parseCloudPull = (text: string | undefined): CloudPull | undefined => {
  if (text === undefined) {
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw invalid("json");
  }
  const repeated = repeatedKey(text);
  if (repeated !== undefined) {
    throw repeatedKeyError(`prices/${CLOUD_PULL_FILE}`, repeated);
  }
  if (!isObject(raw) || raw.cloud_format !== CLOUD_PULL_FORMAT) {
    throw invalid("cloud_format");
  }
  for (const key of Object.keys(raw)) {
    if (!["cloud_format", "origin", "pulled_at", "versions"].includes(key)) {
      throw invalid(key);
    }
  }
  if (typeof raw.origin !== "string") {
    throw invalid("origin");
  }
  if (typeof raw.pulled_at !== "string") {
    throw invalid("pulled_at");
  }
  if (!isObject(raw.versions) || !Object.values(raw.versions).every((v) => typeof v === "string")) {
    throw invalid("versions");
  }
  return raw as unknown as CloudPull;
};

export const serializeCloudPull = (pull: CloudPull): string => `${JSON.stringify(pull, null, 2)}\n`;

/** The asset of a file of closes of the cloud, only by the round trip of its name. */
export const assetOfPriceFile = (name: string): AssetId | undefined => {
  if (!name.endsWith(".jsonl")) {
    return undefined;
  }
  try {
    const assetId = decodeURIComponent(name.slice(0, -".jsonl".length));
    return assetId !== "" && priceFileName(assetId) === name ? assetId : undefined;
  } catch {
    return undefined;
  }
};

/** The files of closes of the index whose version the folder does not hold yet. */
export const changedPriceFiles = <T extends { readonly name: string; readonly version: string }>(
  index: readonly T[],
  pull: CloudPull | undefined,
  origin: string,
): T[] => {
  const held = pull?.origin === origin ? pull.versions : {};
  return index.filter(
    (entry) =>
      assetOfPriceFile(entry.name) !== undefined &&
      (!Object.hasOwn(held, entry.name) || held[entry.name] !== entry.version),
  );
};

/**
 * The lines of the cloud to append to the local file (mutant 23): each line
 * of the cloud, in its order, is decided with the rules of the 013 against
 * the local file **and what was added before it**, keeping the source and the
 * time the cloud gave it. What is local is never rewritten.
 */
export const cloudLinesToAppend = (
  existing: readonly CloseLine[],
  cloud: readonly CloseLine[],
  order: readonly QuoteSource[],
): CloseLine[] => {
  const held = [...existing];
  const added: CloseLine[] = [];
  for (const line of cloud) {
    for (const next of linesToAppend(held, [line], line.source, order, line.fetched_at)) {
      held.push(next);
      added.push(next);
    }
  }
  return added;
};
