// `atlas admin prices push` (feature 016, E2, block 3; §8.1 P18, amended in
// §8.2 M4 and M5): what uploading the local `prices/symbols.json` would change
// in the cloud, and when it is refused. **Only that file** — the budget of the
// cloud is configuration of its Lambda, and the local `prices/config.json`
// stays the console's — and **no local state**: the plan compares the local
// bytes with the remote object read right now, and the order writes on the
// ETag of that same read.
//
// Refused, with nothing written: no local file; a local file that cannot be
// read or is of a newer format (`parseSymbols` says which); one that still
// has closes stored in a wrong currency (`misstored`: purge them locally
// first, or the cloud would keep them out of every figure forever); and a
// remote file of a newer format, which an older console must never rewrite.
// A remote file that cannot be read is replaced, and said: it is the one way
// to repair it without the command line of AWS.

import { DomainError, ValidationError } from "../errors.js";
import type { AssetId } from "../schema/events.js";
import { parseSymbols, type SymbolEntry, type SymbolsFile } from "./symbols.js";

/** One asset whose correspondence the upload changes, with the fields that differ. */
export interface SymbolsPushChange {
  readonly asset_id: AssetId;
  readonly change: "added" | "removed" | "changed";
  /** The fields of its entry that differ, by name; empty when added or removed. */
  readonly fields: readonly string[];
}

export type SymbolsPushPlan =
  /** The remote has exactly these bytes: nothing to upload. */
  | { readonly kind: "same" }
  | {
      readonly kind: "push";
      /** What the remote was: none, one that reads, or one that does not. */
      readonly remote: "absent" | "readable" | "unreadable";
      /** By asset; empty when only the form of the file changes. */
      readonly changes: readonly SymbolsPushChange[];
    };

/** JSON with its keys in order, so two entries compare by content, not by writing. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "object" && item !== null && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );

const fieldsOf = (before: SymbolEntry, after: SymbolEntry): string[] => {
  const left = before as unknown as Record<string, unknown>;
  const right = after as unknown as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((field) => canonical(left[field]) !== canonical(right[field]))
    .sort();
};

/** The remote as the plan sees it: absent, read, or unreadable (and replaced). */
const readRemote = (
  text: string | undefined,
): { kind: "absent" } | { kind: "readable"; file: SymbolsFile } | { kind: "unreadable" } => {
  if (text === undefined) {
    return { kind: "absent" };
  }
  try {
    return { kind: "readable", file: parseSymbols(text) };
  } catch (error) {
    if (error instanceof ValidationError && error.code === "symbols_file_newer_version") {
      throw new DomainError(
        "symbols_push_remote_newer",
        "the remote prices/symbols.json is of a newer format",
        { format: error.details.format },
      );
    }
    return { kind: "unreadable" };
  }
};

/**
 * The plan of the upload of `local` over `remote` (the texts of the two
 * `prices/symbols.json`; `undefined` when there is none). Throws the refusals.
 */
export const symbolsPushPlan = (
  local: string | undefined,
  remote: string | undefined,
): SymbolsPushPlan => {
  if (local === undefined) {
    throw new DomainError("symbols_push_missing", "there is no local prices/symbols.json", {});
  }
  const mine = parseSymbols(local);
  const misstored = Object.entries(mine.assets)
    .filter(([, entry]) => entry.misstored !== undefined)
    .map(([assetId]) => assetId)
    .sort();
  if (misstored.length > 0) {
    throw new DomainError(
      "symbols_push_misstored",
      "the local prices/symbols.json has closes stored in another currency",
      { assets: misstored },
    );
  }
  const theirs = readRemote(remote);
  if (theirs.kind === "readable" && remote === local) {
    return { kind: "same" };
  }
  const before = theirs.kind === "readable" ? theirs.file.assets : {};
  const changes: SymbolsPushChange[] = [];
  for (const assetId of [
    ...new Set([...Object.keys(before), ...Object.keys(mine.assets)]),
  ].sort()) {
    const was = before[assetId];
    const is = mine.assets[assetId];
    if (was === undefined) {
      changes.push({ asset_id: assetId, change: "added", fields: [] });
    } else if (is === undefined) {
      changes.push({ asset_id: assetId, change: "removed", fields: [] });
    } else {
      const fields = fieldsOf(was, is);
      if (fields.length > 0) {
        changes.push({ asset_id: assetId, change: "changed", fields });
      }
    }
  }
  return { kind: "push", remote: theirs.kind, changes };
};
