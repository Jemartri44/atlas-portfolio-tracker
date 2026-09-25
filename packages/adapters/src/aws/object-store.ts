// The narrow interface of S3 the API needs (feature 015, §7 P3): nothing of
// the SDK here. The adapter of the SDK — if the user authorises installing it
// — implements it in `sdk-s3.ts`; the tests, with a double that imitates what
// the documentation of Amazon S3 says (conditional writes, consulted
// 2026-09-25: `docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html`).
// There is no delete: the API never deletes (ADR-0028, row 7).

export interface StoredObject {
  readonly body: Uint8Array;
  /** The opaque ETag of S3: never the SHA-256 of the bytes. */
  readonly etag: string;
}

export interface ObjectStore {
  get(key: string): Promise<StoredObject | undefined>;
  /** `PutObject` with `If-None-Match: *`: `exists` on a 412 (or a 409 of a race). */
  putIfNoneMatch(key: string, body: Uint8Array): Promise<"created" | "exists">;
  /** `PutObject` with `If-Match: <etag>`: `precondition_failed` on a 412 or a 409. */
  putIfMatch(
    key: string,
    body: Uint8Array,
    etag: string,
  ): Promise<"written" | "precondition_failed">;
}
