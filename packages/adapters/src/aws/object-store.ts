// The narrow interface of S3 the API needs (feature 015, §7 P3): nothing of
// the SDK here. The adapter of the SDK implements it in `sdk-s3.ts`; the
// tests, with a double that imitates what the documentation of Amazon S3
// says (conditional writes, block 0 of E3, questions.md §23.1).
// There is no delete: the API never deletes (ADR-0028, row 7).

export interface StoredObject {
  readonly body: Uint8Array;
  /** The opaque ETag of S3: never the SHA-256 of the bytes. */
  readonly etag: string;
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
