// The rules of the routes of the sync and of the reference data (feature
// 015, E3; `docs/api.md` §5 and §6), pure. What a line is worth is
// `acceptAppend` and `acceptInit` (`@atlas/domain/sync`); this is what the
// handler needs around them: the etag a write asks for, the names of the reference data and the answer
// of a conditional read. The handler decides nothing of it.

import type { RemoteError } from "../ports/remote-ledger.js";
import { priceFileName } from "../quotes/line.js";
import { API_ERRORS, type ApiErrorCode, type ApiRefusal, refusal } from "./codes.js";

const STRONG_SHA = /^"([0-9a-f]{64})"$/;

/**
 * The `If-Match` of `POST /api/ledger/lines` and `PUT /api/ledger`: absent
 * (`428`), or the SHA-256 it quotes. Anything else — weak, unquoted, a list,
 * `*`, upper case — can never be the etag of the remote, and is the empty
 * etag that no remote has: the write is `412` and nothing is written.
 */
export const requestedEtag = (
  header: string | undefined,
): { readonly absent: true } | { readonly etag: string } => {
  if (header === undefined) {
    return { absent: true };
  }
  return { etag: STRONG_SHA.exec(header)?.[1] ?? "" };
};

export type ReferenceKind = "ecb" | "prices";

const PREFIX: Readonly<Record<ReferenceKind, string>> = {
  ecb: "reference/ecb/",
  prices: "prices/",
};

const REFERENCE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** The files of `prices/` served by their own name: never `_status.json` nor `config.json`. */
const PRICE_FILES: readonly string[] = ["symbols.json"];

/** The longest name of a price file: what a file system names (feature 016, §8.2 M1). */
export const MAX_PRICE_NAME = 255;

/**
 * Whether `name` is **exactly what `priceFileName` writes** for some asset:
 * decoding it and encoding it again gives the same name (feature 016, E2;
 * §8.2 M1, amending P6 bis). The encoder never writes a `/`, so nothing can
 * leave `prices/`; and a name it does not write is not a price file.
 */
const isPriceFileName = (name: string): boolean => {
  if (name.length > MAX_PRICE_NAME || !name.endsWith(".jsonl")) {
    return false;
  }
  try {
    const assetId = decodeURIComponent(name.slice(0, -".jsonl".length));
    return assetId !== "" && priceFileName(assetId) === name;
  } catch {
    return false;
  }
};

/** Whether a name of `kind` may be served: the rule of each prefix, decided before S3 (§6). */
export const isReferenceName = (kind: ReferenceKind, name: string): boolean =>
  kind === "prices"
    ? PRICE_FILES.includes(name) || isPriceFileName(name)
    : REFERENCE_NAME.test(name) && !name.includes("..");

/**
 * The key of a reference file, **built only from a name its prefix serves**:
 * nothing can leave `reference/ecb/` or `prices/`, and it is decided before S3
 * is touched (§6; mutant 33).
 */
export const referenceKey = (
  kind: ReferenceKind,
  name: string,
): { readonly key: string } | ApiRefusal =>
  isReferenceName(kind, name)
    ? { key: `${PREFIX[kind]}${name}` }
    : refusal("reference_name_invalid");

const TYPES: readonly (readonly [string, string])[] = [
  [".csv", "text/csv; charset=utf-8"],
  [".jsonl", "application/x-ndjson; charset=utf-8"],
  [".json", "application/json"],
];

/** The type of a reference file by its extension; any other is not served (`404`). */
export const referenceContentType = (name: string): string | undefined =>
  TYPES.find(([extension]) => name.endsWith(extension))?.[1];

export interface ReferenceEntry {
  readonly name: string;
  /** Opaque: the ETag of S3 without its quotes; it says what changed without downloading. */
  readonly version: string;
  readonly size: number;
}

/** The version of a stored object: its ETag without `W/` and without quotes. */
export const versionOf = (etag: string): string => etag.replace(/^W\//, "").replace(/^"|"$/g, "");

const entriesOf = (
  listed: readonly { readonly key: string; readonly etag: string; readonly size: number }[],
  kind: ReferenceKind,
): ReferenceEntry[] =>
  listed
    .filter(
      (object) =>
        object.key.startsWith(PREFIX[kind]) &&
        isReferenceName(kind, object.key.slice(PREFIX[kind].length)),
    )
    .map((object) => ({
      name: object.key.slice(PREFIX[kind].length),
      version: versionOf(object.etag),
      size: object.size,
    }))
    // By code point, as the keys of S3 are listed.
    .sort((a, b) => Number(a.name > b.name) - Number(a.name < b.name));

/** `GET /api/reference/index`: the first level of each prefix (§6). */
export const referenceIndex = (
  ecb: readonly { readonly key: string; readonly etag: string; readonly size: number }[],
  prices: readonly { readonly key: string; readonly etag: string; readonly size: number }[],
): { readonly ecb: ReferenceEntry[]; readonly prices: ReferenceEntry[] } => ({
  ecb: entriesOf(ecb, "ecb"),
  prices: entriesOf(prices, "prices"),
});

/**
 * Whether an `If-None-Match` names the version (`304`). A weak `W/"…"`
 * counts, because CloudFront weakens the ETag when it compresses (block 0 of
 * E3, §23.3); an unquoted value does not.
 */
export const ifNoneMatchHits = (header: string | undefined, version: string): boolean => {
  if (header === undefined) {
    return false;
  }
  return header
    .split(",")
    .map((part) => part.trim())
    .some((part) => part === "*" || part.replace(/^W\//, "") === `"${version}"`);
};

/**
 * A rule of the sync that said no, thrown as a `RemoteError` by the domain
 * (`parseAppendBody`, `parseInitBody`, `acceptInit`),
 * answered with **its own** code and details. A code the API does not answer
 * is a bug, never folded into another.
 */
export const refusalOfRemote = (error: RemoteError): ApiRefusal => {
  if (!Object.hasOwn(API_ERRORS, error.code)) {
    throw new Error(`the API has no answer for ${error.code}`);
  }
  return refusal(error.code as ApiErrorCode, error.details);
};
