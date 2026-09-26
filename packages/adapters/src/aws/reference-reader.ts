// The reference data of the bucket, read only (feature 015, E3; `docs/api.md`
// §6; review of PR #96, security N1): `reference/ecb/` and `prices/`, and
// nothing else. The routes of the API get this and never the whole
// `ObjectStore`, so no route can write, or read outside those two prefixes,
// even by mistake: a key elsewhere is refused before S3 is asked.

import type { ListedObject, ObjectStore, StoredObject } from "./object-store.js";

export const REFERENCE_PREFIXES = ["reference/ecb/", "prices/"] as const;

export type ReferencePrefix = (typeof REFERENCE_PREFIXES)[number];

const inside = (key: string): boolean =>
  REFERENCE_PREFIXES.some(
    (prefix) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"),
  );

export interface ReferenceReader {
  get(key: string): Promise<StoredObject | undefined>;
  list(prefix: ReferencePrefix): Promise<readonly ListedObject[]>;
}

export const referenceReader = (objects: ObjectStore): ReferenceReader => ({
  get: (key) => {
    if (!inside(key)) {
      return Promise.reject(new RangeError("a key outside the reference data"));
    }
    return objects.get(key);
  },
  list: (prefix) => {
    if (!REFERENCE_PREFIXES.includes(prefix)) {
      return Promise.reject(new RangeError("a prefix outside the reference data"));
    }
    return objects.list(prefix);
  },
});
