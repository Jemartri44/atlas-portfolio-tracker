// The bytes of a ledger in memory, for the tests of the web: one double for
// every file that needs one (they used to carry six copies). It honours the
// one write the store has since feature 012 — compare and write in one step —
// so a test cannot pass by writing over a stale etag.

import { BlobArchiveExists, type LedgerBlob } from "@atlas/adapters/blob";
import { ConflictError, sha256Hex } from "@atlas/domain";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class MemoryBlob implements LedgerBlob {
  readonly label = "memoria";
  readonly archives = new Map<string, string>();
  writes = 0;

  /** `readOnly`: any write fails, for the screens that must never write. */
  constructor(
    public text: string,
    private readonly readOnly = false,
  ) {}

  async read(): Promise<Uint8Array> {
    return encoder.encode(this.text);
  }

  async update(
    expectedEtag: string,
    produce: (current: Uint8Array) => Uint8Array,
    archiveName?: string,
  ): Promise<Uint8Array> {
    if (this.readOnly) {
      throw new Error("estas pruebas no escriben");
    }
    const current = encoder.encode(this.text);
    if (sha256Hex(current) !== expectedEtag) {
      throw new ConflictError();
    }
    const next = produce(current);
    if (archiveName !== undefined) {
      if (this.archives.has(archiveName)) {
        throw new BlobArchiveExists(archiveName);
      }
      this.archives.set(archiveName, this.text);
    }
    this.writes += 1;
    this.text = decoder.decode(next);
    return next;
  }
}
