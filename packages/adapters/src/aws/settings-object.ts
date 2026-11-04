// The exposure the owner declares per asset, as the API reaches it (`docs/api.md` §6.2):
// `settings/exposure.json` and nothing else, read, created once, or replaced **only on the version
// that was read**. Never deleted. The route gets this and never the whole `ObjectStore`.

import { EXPOSURE_KEY } from "@atlas/domain/portfolio";
import type { ObjectStore, StoredObject } from "./object-store.js";

export interface ExposureObject {
  read(): Promise<StoredObject | undefined>;
  /** `PutObject` with `If-None-Match: *`: `exists` if the object is already there. */
  create(body: Uint8Array): Promise<"created" | "exists">;
  /** `PutObject` with `If-Match` on the S3 ETag of the read: `precondition_failed` if it moved. */
  replace(body: Uint8Array, etag: string): Promise<"written" | "precondition_failed">;
}

export const exposureObject = (objects: ObjectStore): ExposureObject => ({
  read: () => objects.get(EXPOSURE_KEY),
  create: (body) => objects.putIfNoneMatch(EXPOSURE_KEY, body),
  replace: (body, etag) => objects.putIfMatch(EXPOSURE_KEY, body, etag),
});
