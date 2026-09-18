// LedgerStore over a plain byte store (data-schema.md §5, ADR-0019). Everything
// the port contract demands lives here, once: the etag is the SHA-256 of the
// bytes, `append` copies the original bytes verbatim before the new lines,
// `replace` (compact only) saves the original bytes under an archive name that
// is never overwritten, and a line written by a newer schema aborts the load.
//
// It knows nothing about files, directories or IndexedDB: that is the whole
// point. The three byte-level methods of `LedgerBlob` are the only thing that
// changes between the disk and the browser, and they are the only thing that
// cannot be tested in Node. This class is exercised by the same contract tests
// that `MemoryLedgerStore` and `FileLedgerStore` pass.

import {
  ArchiveExistsError,
  ConflictError,
  CURRENT_LEDGER_SCHEMA,
  decodeLine,
  encodeLine,
  type LedgerEvent,
  type LedgerSchema,
  type LedgerStore,
  type LoadedLedger,
  sha256Hex,
  utf8Encode,
  ValidationError,
} from "@atlas/domain";

const NEWLINE = 0x0a;

/**
 * Access to the bytes of the ledger and of its archives. Implemented by the
 * browser handles (`./browser`) and by a trivial in-memory double in the tests.
 */
export interface LedgerBlob {
  /** Human description for the interface: "ledger.jsonl en Cartera", "almacenamiento del navegador". */
  readonly label: string;
  /** Current bytes; empty when the ledger does not exist yet. */
  read(): Promise<Uint8Array>;
  /** Replaces the content with these bytes, atomically where the medium allows it. */
  write(bytes: Uint8Array): Promise<void>;
  /** Writes an archive under that name; must reject when it already exists. */
  writeArchive(name: string, bytes: Uint8Array): Promise<void>;
}

/** Raised by a blob when the archive it was asked to write is already there. */
export class BlobArchiveExists extends Error {
  constructor(
    readonly archiveName: string,
    options?: ErrorOptions,
  ) {
    super(`archive ${archiveName} already exists`, options);
    this.name = "BlobArchiveExists";
  }
}

const decoder = new TextDecoder();

const concat = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  const out = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
};

const serialise = (events: readonly LedgerEvent[]): string =>
  events.map((event) => `${encodeLine(event)}\n`).join("");

const linesOf = (bytes: Uint8Array): string[] => {
  const lines = decoder.decode(bytes).split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
};

export class BlobLedgerStore implements LedgerStore {
  constructor(
    private readonly blob: LedgerBlob,
    readonly schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
  ) {}

  /** What the interface shows when it says where the ledger is (FR-011). */
  get label(): string {
    return this.blob.label;
  }

  async load(): Promise<LoadedLedger> {
    const bytes = await this.blob.read();
    const lines = linesOf(bytes);
    const events: LedgerEvent[] = lines.map((line, index) => {
      try {
        return decodeLine(line, this.schema).event;
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ValidationError(error.code, `line ${index + 1}: ${error.message}`, {
            ...error.details,
            line: index + 1,
          });
        }
        throw error;
      }
    });
    return { events, etag: sha256Hex(bytes), lines };
  }

  /** The current bytes, or ConflictError when they are not the ones the caller read. */
  private async currentBytes(etag: string): Promise<Uint8Array> {
    const bytes = await this.blob.read();
    if (sha256Hex(bytes) !== etag) {
      throw new ConflictError();
    }
    return bytes;
  }

  async append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }> {
    const bytes = await this.currentBytes(etag);
    const separator = bytes.length > 0 && bytes[bytes.length - 1] !== NEWLINE ? "\n" : "";
    const next = concat(bytes, utf8Encode(separator + serialise(events)));
    await this.blob.write(next);
    return { etag: sha256Hex(next) };
  }

  async replace(
    events: readonly LedgerEvent[],
    etag: string,
    archiveName: string,
  ): Promise<{ etag: string }> {
    if (archiveName.length === 0 || /[/\\]/.test(archiveName)) {
      throw new ValidationError("invalid_archive_name", "archive name must be a plain file name", {
        archive_name: archiveName,
      });
    }
    const bytes = await this.currentBytes(etag);
    try {
      await this.blob.writeArchive(archiveName, bytes);
    } catch (error) {
      if (error instanceof BlobArchiveExists) {
        throw new ArchiveExistsError(archiveName);
      }
      throw error;
    }
    const next = utf8Encode(serialise(events));
    await this.blob.write(next);
    return { etag: sha256Hex(next) };
  }
}
