// TEST ONLY — a double of Amazon S3 for the narrow `ObjectStore`, **never
// reachable from the product** (architecture test). It imitates what the
// documentation of S3 says of conditional writes (block 0 of E3,
// `specs/015-api-access/questions.md` §23.1, consulted 2026-09-26:
// `docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html` and
// `…/API/API_PutObject.html`):
// - `If-None-Match`: «If there's an existing object, the write operation
//   fails, resulting in a 412 Precondition Failed response», and in a race
//   «the first write operation to finish succeeds»;
// - `If-Match`: «If the ETag doesn't match, the write operation fails with a
//   412», «You can also receive a 409 Conflict response in the case of
//   concurrent requests» (`conflictNext`), and with no object «the operation
//   fails with a 404 Not Found error» — all three are a failed condition for
//   the narrow interface, as the adapter of the SDK translates them.
// The ETag is opaque, never the SHA-256 of the bytes. There is no delete.

import {
  DependencyUnavailable,
  type ListedObject,
  type ObjectStore,
  type StoredObject,
} from "@atlas/adapters/aws";

export class TestOnlyFakeS3 implements ObjectStore {
  private readonly objects = new Map<string, StoredObject>();
  private version = 0;
  private failures = 0;
  private conflicts = 0;
  readonly calls: string[] = [];
  /** The condition of every conditional write, as it reached S3. */
  readonly conditions: { key: string; ifMatch?: string; ifNoneMatch?: "*" }[] = [];
  /** Runs inside every conditional write, before S3 decides: another writer can win here. */
  beforePut: ((key: string) => void) | undefined;

  /** The next `count` calls fail as S3 does when it throttles or errs (a 5xx). */
  failNext(count = 1): void {
    this.failures = count;
  }

  /** The next conditional write meets a concurrent request: the `409` of §23.1. */
  conflictNext(): void {
    this.conflicts = 1;
  }

  private step(call: string): void {
    this.calls.push(call);
    if (this.failures > 0) {
      this.failures -= 1;
      throw new DependencyUnavailable("s3", "status_503");
    }
  }

  /** The race of §23.1: another writer first, then a 409 if one was asked for. */
  private contend(key: string): boolean {
    this.beforePut?.(key);
    if (this.conflicts > 0) {
      this.conflicts -= 1;
      return true;
    }
    return false;
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
    this.conditions.push({ key, ifNoneMatch: "*" });
    if (this.contend(key) || this.objects.has(key)) {
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
    this.conditions.push({ key, ifMatch: etag });
    // 412 (another ETag), 409 (a concurrent request) and 404 (no object): one answer.
    if (this.contend(key) || this.objects.get(key)?.etag !== etag) {
      return "precondition_failed";
    }
    this.store(key, body);
    return "written";
  }

  async list(prefix: string): Promise<readonly ListedObject[]> {
    this.step(`list ${prefix}`);
    return [...this.objects]
      .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
      .map(([key, stored]) => ({ key, etag: stored.etag, size: stored.body.length }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  // --- What a test does from outside the API (the console of AWS, an admin) ---

  seed(key: string, text: string): void {
    this.store(key, new TextEncoder().encode(text));
  }

  seedBytes(key: string, body: Uint8Array): void {
    this.store(key, body);
  }

  text(key: string): string | undefined {
    const stored = this.objects.get(key);
    return stored === undefined ? undefined : new TextDecoder().decode(stored.body);
  }

  etagOf(key: string): string | undefined {
    return this.objects.get(key)?.etag;
  }

  deleteOutOfBand(key: string): void {
    this.objects.delete(key);
  }

  keys(): string[] {
    return [...this.objects.keys()].sort();
  }
}
