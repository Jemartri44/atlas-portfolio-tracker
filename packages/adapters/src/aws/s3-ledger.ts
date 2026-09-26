// The remote ledger in the data bucket, `ledger/ledger.jsonl` (ADR-0026,
// Part A; feature 015, E3, block 1). A `LedgerBlob` over the narrow
// `ObjectStore`, so the six operations of the port are `BlobLedgerStore`'s —
// the same code the browser runs — and the contract tests are the same.
//
// The etag of the store is the SHA-256 of the bytes; the ETag of S3 is only
// the condition of the write, taken from the read that gave those bytes
// (block 0 of E3, questions.md §23.2). A write with a stale condition fails
// as S3 says (412, 409 or, with no object, 404: §23.1) and is a ConflictError.
//
// **One difference with IndexedDB, said here**: saving the archive and
// writing the ledger are two conditional writes, not one atomic step. If
// another writer wins between them, an archive stays behind and the ledger
// does not change. That archive is the exact bytes that were the ledger at
// that moment, it is never overwritten (`If-None-Match: *`), and a retry
// takes another name (`syncArchiveName`). Nothing is lost and nothing is
// written over.

import { ConflictError, sha256Hex } from "@atlas/domain";
import { BlobArchiveExists, BlobLedgerStore, type LedgerBlob } from "../ledger-store/blob.js";
import type { ObjectStore } from "./object-store.js";

export const LEDGER_KEY = "ledger/ledger.jsonl";

/** An archive of the remote ledger (`docs/data-schema.md` §1): a plain name under `archive/`. */
export const archiveKey = (name: string): string => `archive/${name}`;

export class S3LedgerBlob implements LedgerBlob {
  readonly label = "bucket de datos";

  constructor(private readonly objects: ObjectStore) {}

  async read(): Promise<Uint8Array> {
    return (await this.objects.get(LEDGER_KEY))?.body ?? new Uint8Array();
  }

  async update(
    expectedEtag: string,
    produce: (current: Uint8Array) => Uint8Array,
    archiveName?: string,
  ): Promise<Uint8Array> {
    const stored = await this.objects.get(LEDGER_KEY);
    const current = stored?.body ?? new Uint8Array();
    if (sha256Hex(current) !== expectedEtag) {
      throw new ConflictError();
    }
    const next = produce(current);
    if (
      archiveName !== undefined &&
      (await this.objects.putIfNoneMatch(archiveKey(archiveName), current)) === "exists"
    ) {
      throw new BlobArchiveExists(archiveName);
    }
    const written =
      stored === undefined
        ? (await this.objects.putIfNoneMatch(LEDGER_KEY, next)) === "created"
        : (await this.objects.putIfMatch(LEDGER_KEY, next, stored.etag)) === "written";
    if (!written) {
      throw new ConflictError();
    }
    return next;
  }
}

/**
 * **All the API may do with the remote ledger** (ADR-0026, Part A): read its
 * bytes and append lines exactly as given. The initialisation of an empty
 * remote is an append on the etag of zero bytes. Nothing here rewrites or
 * deletes, and the handler holds nothing else (architecture test).
 */
export interface AppendOnlyLedger {
  read(): Promise<Uint8Array>;
  /** `BlobLedgerStore.appendLines`: a stale etag or a lost race is a ConflictError. */
  appendLines(lines: readonly string[], etag: string): Promise<{ etag: string }>;
}

export const appendOnlyLedger = (objects: ObjectStore): AppendOnlyLedger => {
  const blob = new S3LedgerBlob(objects);
  const store = new BlobLedgerStore(blob);
  return {
    read: () => blob.read(),
    appendLines: (lines, etag) => store.appendLines(lines, etag),
  };
};
