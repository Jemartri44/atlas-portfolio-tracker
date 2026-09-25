// TEST ONLY — a double of Amazon S3 for the narrow `ObjectStore`, **never
// reachable from the product** (architecture test). It imitates what the
// documentation of S3 says of conditional writes (consulted 2026-09-25,
// `docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html`):
// «If there's an existing object, the write operation fails, resulting in a
// 412 Precondition Failed response» for `If-None-Match`, and for `If-Match`
// «the first write operation to finish succeeds. Amazon S3 then fails
// subsequent writes with a 412». Block 0 of E3 verifies the rest (the 409).
// The ETag is opaque, never the SHA-256 of the bytes.

import { DependencyUnavailable, type ObjectStore, type StoredObject } from "@atlas/adapters/aws";

export class TestOnlyFakeS3 implements ObjectStore {
  private readonly objects = new Map<string, StoredObject>();
  private version = 0;
  private failures = 0;
  readonly calls: string[] = [];

  /** The next `count` calls fail as S3 does when it throttles or errs (a 5xx). */
  failNext(count = 1): void {
    this.failures = count;
  }

  private step(call: string): void {
    this.calls.push(call);
    if (this.failures > 0) {
      this.failures -= 1;
      throw new DependencyUnavailable("s3", "status_503");
    }
  }

  private store(key: string, body: Uint8Array): void {
    this.version += 1;
    this.objects.set(key, { body: Uint8Array.from(body), etag: `"fake-${this.version}"` });
  }

  async get(key: string): Promise<StoredObject | undefined> {
    this.step(`get ${key}`);
    return this.objects.get(key);
  }

  async putIfNoneMatch(key: string, body: Uint8Array): Promise<"created" | "exists"> {
    this.step(`putIfNoneMatch ${key}`);
    if (this.objects.has(key)) {
      return "exists";
    }
    this.store(key, body);
    return "created";
  }

  async putIfMatch(
    key: string,
    body: Uint8Array,
    etag: string,
  ): Promise<"written" | "precondition_failed"> {
    this.step(`putIfMatch ${key}`);
    if (this.objects.get(key)?.etag !== etag) {
      return "precondition_failed";
    }
    this.store(key, body);
    return "written";
  }

  // --- What a test does from outside the API (the console of AWS, an admin) ---

  seed(key: string, text: string): void {
    this.store(key, new TextEncoder().encode(text));
  }

  text(key: string): string | undefined {
    const stored = this.objects.get(key);
    return stored === undefined ? undefined : new TextDecoder().decode(stored.body);
  }

  deleteOutOfBand(key: string): void {
    this.objects.delete(key);
  }

  keys(): string[] {
    return [...this.objects.keys()].sort();
  }
}
