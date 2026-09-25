// LedgerStore over a plain byte store (data-schema.md §5, ADR-0019). Everything
// the port contract demands lives here, once: the etag is the SHA-256 of the
// bytes, `append` copies the original bytes verbatim before the new lines,
// `replace` (compact only) saves the original bytes under an archive name that
// is never overwritten, and a line written by a newer schema aborts the load.
//
// It knows nothing about IndexedDB: that is the whole point. The two
// byte-level methods of `LedgerBlob` are the only thing that changes with the
// medium, and the comparison of the etag lives **inside** the one that writes,
// so it happens in the same atomic step as the write (feature 012, block 0). This class is exercised by the same contract tests
// that `MemoryLedgerStore` and `FileLedgerStore` pass.

import {
  ArchiveExistsError,
  CURRENT_LEDGER_SCHEMA,
  decodeLines,
  encodeLine,
  type LedgerEvent,
  type LedgerSchema,
  type LedgerStore,
  type LoadedLedger,
  rawLinesText,
  sha256Hex,
  utf8Encode,
  ValidationError,
} from "@atlas/domain";

const NEWLINE = 0x0a;

/**
 * Access to the bytes of the ledger and of its archives. Implemented by the
 * browser's own storage (`./browser`) and by trivial in-memory doubles in the
 * tests.
 *
 * **There is no way to write without comparing** (feature 012, block 0). A
 * `read` followed by a separate `write` was a window: another tab could write
 * in between, and one of the two lines was lost without anyone knowing. So the
 * only write is `update`, which compares and writes as **one** atomic step of
 * the medium — one IndexedDB transaction in the browser.
 */
export interface LedgerBlob {
  /** Human description for the interface: "almacenamiento del navegador". */
  readonly label: string;
  /** Current bytes; empty when the ledger does not exist yet. */
  read(): Promise<Uint8Array>;
  /**
   * In one atomic step: reads the current bytes, throws ConflictError unless
   * their SHA-256 is `expectedEtag`, saves them under `archiveName` when one is
   * given (BlobArchiveExists, and nothing written, when it already exists) and
   * replaces them with `produce(current)`. Resolves with the bytes written.
   * `produce` must be synchronous: nothing may wait between the read and the
   * write.
   */
  update(
    expectedEtag: string,
    produce: (current: Uint8Array) => Uint8Array,
    archiveName?: string,
  ): Promise<Uint8Array>;
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
    const events = decodeLines(lines, this.schema);
    return { events, etag: sha256Hex(bytes), lines };
  }

  /** Adds `text` at the end, on `etag`, in the one atomic step of the medium. */
  private async add(text: string, etag: string): Promise<{ etag: string }> {
    const next = await this.blob.update(etag, (bytes) => {
      const separator = bytes.length > 0 && bytes[bytes.length - 1] !== NEWLINE ? "\n" : "";
      return concat(bytes, utf8Encode(separator + text));
    });
    return { etag: sha256Hex(next) };
  }

  /** Replaces the whole text by `text`, archiving the current bytes first. */
  private async put(text: string, etag: string, archiveName: string): Promise<{ etag: string }> {
    if (archiveName.length === 0 || /[/\\]/.test(archiveName)) {
      throw new ValidationError("invalid_archive_name", "archive name must be a plain file name", {
        archive_name: archiveName,
      });
    }
    const content = utf8Encode(text);
    let next: Uint8Array;
    try {
      next = await this.blob.update(etag, () => content, archiveName);
    } catch (error) {
      if (error instanceof BlobArchiveExists) {
        throw new ArchiveExistsError(archiveName);
      }
      throw error;
    }
    return { etag: sha256Hex(next) };
  }

  append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }> {
    return this.add(serialise(events), etag);
  }

  replace(
    events: readonly LedgerEvent[],
    etag: string,
    archiveName: string,
  ): Promise<{ etag: string }> {
    return this.put(serialise(events), etag, archiveName);
  }

  /** The bytes exactly as given (ADR-0026, Part A, amendment): the sync and the restore only. */
  async appendLines(lines: readonly string[], etag: string): Promise<{ etag: string }> {
    return this.add(rawLinesText(lines, this.schema), etag);
  }

  async replaceLines(
    lines: readonly string[],
    etag: string,
    archiveName: string,
  ): Promise<{ etag: string }> {
    return this.put(rawLinesText(lines, this.schema), etag, archiveName);
  }
}
