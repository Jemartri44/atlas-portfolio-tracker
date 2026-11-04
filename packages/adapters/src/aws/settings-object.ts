// One object of `settings/` as the API reaches it (`docs/api.md` §6.2): that key and nothing else,
// read, created once, or replaced **only on the version that was read**. Never deleted. The route
// gets this and never the whole `ObjectStore`.

import type { ObjectStore, StoredObject } from "./object-store.js";

export interface SettingsObject {
  read(): Promise<StoredObject | undefined>;
  /** `PutObject` with `If-None-Match: *`: `exists` if the object is already there. */
  create(body: Uint8Array): Promise<"created" | "exists">;
  /** `PutObject` with `If-Match` on the S3 ETag of the read: `precondition_failed` if it moved. */
  replace(body: Uint8Array, etag: string): Promise<"written" | "precondition_failed">;
}

export const settingsObject = (objects: ObjectStore, key: string): SettingsObject => ({
  read: () => objects.get(key),
  create: (body) => objects.putIfNoneMatch(key, body),
  replace: (body, etag) => objects.putIfMatch(key, body, etag),
});
