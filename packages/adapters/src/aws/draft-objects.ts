// The drafts of the cloud, as the API reaches them (ADR-0035, E6;
// `docs/api.md` §6.1): `drafts/` and nothing else, **read, create and list —
// never overwrite, never delete**. The routes get this and never the whole
// `ObjectStore`, so no route can touch another key, or write a key twice, by
// mistake. Every key is one of the three a draft has (`ecb/cloud-drafts.ts`).

import { DRAFTS_PREFIX, parseDraftName } from "@atlas/domain/ecb";
import type { ListedObject, ObjectStore, StoredObject } from "./object-store.js";

export interface DraftObjects {
  get(key: string): Promise<StoredObject | undefined>;
  /** `PutObject` with `If-None-Match: *`: `exists` if the key is already taken. */
  create(key: string, body: Uint8Array): Promise<"created" | "exists">;
  /** The first level of `drafts/`, every page. */
  list(): Promise<readonly ListedObject[]>;
}

const own = (key: string): boolean =>
  key.startsWith(DRAFTS_PREFIX) && parseDraftName(key.slice(DRAFTS_PREFIX.length)) !== undefined;

const outside = (): Promise<never> => Promise.reject(new RangeError("a key outside the drafts"));

export const draftObjects = (objects: ObjectStore): DraftObjects => ({
  get: (key) => (own(key) ? objects.get(key) : outside()),
  create: (key, body) => (own(key) ? objects.putIfNoneMatch(key, body) : outside()),
  list: () => objects.list(DRAFTS_PREFIX),
});
