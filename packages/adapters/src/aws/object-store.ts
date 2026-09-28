// The narrow interface of S3 the API needs (feature 015, §7 P3): nothing of
// the SDK here. The adapter of the SDK implements it in `sdk-s3.ts`; the
// tests, with a double that imitates what the documentation of Amazon S3
// says (conditional writes, block 0 of E3, questions.md §23.1).
// There is no delete: the API never deletes (ADR-0028, row 7).

export interface StoredObject {
  readonly body: Uint8Array;
  /** The opaque ETag of S3: never the SHA-256 of the bytes. */
  readonly etag: string;
  /** The version of the object, when the bucket is versioned (`atlas admin prices push` says it). */
  readonly versionId?: string;
}

/** One object of a listing: the first level under a prefix. */
export interface ListedObject {
  readonly key: string;
  /** Opaque, as `StoredObject.etag`. */
  readonly etag: string;
  readonly size: number;
}

export interface ObjectStore {
  get(key: string): Promise<StoredObject | undefined>;
  /** `PutObject` with `If-None-Match: *`: `exists` on a 412 (or a 409 of a race). */
  putIfNoneMatch(key: string, body: Uint8Array): Promise<"created" | "exists">;
  /**
   * `PutObject` with `If-Match: <etag>`: `precondition_failed` on a 412, a 409
   * or a 404 (no object: block 0 of E3, questions.md §23.1).
   */
  putIfMatch(
    key: string,
    body: Uint8Array,
    etag: string,
  ): Promise<"written" | "precondition_failed">;
  /**
   * `ListObjectsV2` with `Delimiter: "/"`: the objects of the **first level**
   * under `prefix`, every page, by key. Never what is below a further `/`.
   */
  list(prefix: string): Promise<readonly ListedObject[]>;
}

/**
 * What the **administration** adds (feature 015, E5; ADR-0032), never given to
 * the API: an older version of an object, to restore from it, and every object
 * under a prefix at any depth, to copy `documents/` and `imports/` to disk.
 * Still no delete.
 */
export interface AdminObjectStore extends ObjectStore {
  /** `GetObject` with `VersionId`: nothing when the key or the version does not exist. */
  getVersion(key: string, versionId: string): Promise<StoredObject | undefined>;
  /** `ListObjectsV2` with no delimiter: every object under `prefix`, every page, by key. */
  listAll(prefix: string): Promise<readonly ListedObject[]>;
}
