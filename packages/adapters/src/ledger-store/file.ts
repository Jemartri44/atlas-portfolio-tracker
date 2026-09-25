// Local JSONL LedgerStore (data-schema.md §5): the file is read whole, every
// line is decoded with the store's schema (a newer schema version aborts the
// load), the etag is the SHA-256 of the bytes, `append` copies the original
// bytes verbatim before the new lines, and `replace` (compact only) saves the
// original bytes under archive/ next to the ledger before rewriting it. Both
// writes go through a temporary file that replaces the ledger atomically.
//
// Every write happens under the advisory lock of the folder (`folder-lock.ts`,
// ADR-0026 Part B): taken **before** the etag is compared and released only
// **after** the rename, so no other Atlas console writer can slip in between.
// That closes the window ADR-0025 recorded, between console writers and only
// there: the browser no longer writes in this folder (feature 012, decision of
// the direction), because it has no way to take the lock exclusively.
//
// **The lock is not re-entrant** (`open(…, "wx")`): a writer that holds it and
// calls `append` would lock itself out. So the lock is taken in one place,
// `underLock`, which hands a writer whose operations do **not** take it; every
// public operation is `underLock` plus one write, and a sequence of writes that
// has to be one — step 6 of the sync: what is held back, the ledger, the
// marker — is one `underLock` with several (feature 014, plan §2.1).

import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import {
  ArchiveExistsError,
  ConflictError,
  CURRENT_LEDGER_SCHEMA,
  decodeLines,
  encodeLine,
  type LedgerEvent,
  type LedgerSchema,
  type LedgerStore,
  type LoadedLedger,
  rawLinesText,
  ValidationError,
} from "@atlas/domain";
import { type FileOps, nodeFileOps, type WritableFile } from "./file-ops.js";
import { type HeldLock, withFolderLock } from "./folder-lock.js";

const NEWLINE = 0x0a;

const hasCode = (error: unknown, code: string): boolean =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === code;

const serialise = (events: readonly LedgerEvent[]): string =>
  events.map((event) => `${encodeLine(event)}\n`).join("");

const checkArchiveName = (archiveName: string): void => {
  if (archiveName.length === 0 || /[/\\]/.test(archiveName)) {
    throw new ValidationError("invalid_archive_name", "archive name must be a plain file name", {
      archive_name: archiveName,
    });
  }
};

export interface FileLedgerStoreOptions {
  /**
   * **Test seam only**: runs with the lock held, after the temporary file is
   * written and right before the ownership check and the rename. It is how the
   * tests break the lock, or fail a write half way, at the one moment that
   * matters.
   */
  beforeCommit?: () => Promise<void>;
  /** The file operations; `node:fs/promises` unless a test records or breaks them (V9). */
  fileOps?: FileOps;
}

/**
 * What a holder of the folder lock may do, **without taking it again**. Only
 * `FileLedgerStore.underLock` hands one out, and it is valid only inside it.
 */
export interface LockedLedgerWriter {
  readonly lock: HeldLock;
  /** The ledger as it is now, read under the lock. */
  load(): Promise<LoadedLedger>;
  appendLines(lines: readonly string[], etag: string): Promise<{ etag: string }>;
  replaceLines(
    lines: readonly string[],
    etag: string,
    archiveName: string,
  ): Promise<{ etag: string }>;
  /** The bytes of a file of the folder (`sync/state.json`), or `undefined` when it does not exist. */
  readFile(relativePath: string): Promise<Buffer | undefined>;
  /**
   * Writes a file of the folder atomically and **durably**: a temporary
   * created with `"wx"`, written, `sync()`ed, the lock checked, renamed over
   * the file, and its directory `sync()`ed. When it resolves, the bytes are on
   * disk.
   */
  writeFile(relativePath: string, bytes: Uint8Array): Promise<void>;
}

export class FileLedgerStore implements LedgerStore {
  private readonly ops: FileOps;

  constructor(
    private readonly path: string,
    readonly schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
    private readonly options: FileLedgerStoreOptions = {},
  ) {
    this.ops = options.fileOps ?? nodeFileOps;
  }

  /** The folder of the ledger: where the lock, `archive/` and the rest live. */
  get folder(): string {
    return dirname(this.path);
  }

  private async readOptional(path: string): Promise<Buffer | undefined> {
    try {
      return await this.ops.readFile(path);
    } catch (error) {
      if (hasCode(error, "ENOENT")) {
        return undefined;
      }
      throw error;
    }
  }

  private async readBytes(): Promise<Buffer> {
    return (await this.readOptional(this.path)) ?? Buffer.alloc(0);
  }

  private static etagOf(bytes: Buffer): string {
    return createHash("sha256").update(bytes).digest("hex");
  }

  private static linesOf(bytes: Buffer): string[] {
    const lines = bytes.toString("utf8").split("\n");
    if (lines[lines.length - 1] === "") {
      lines.pop();
    }
    return lines;
  }

  /**
   * Writes `bytes` to a temporary file, fsyncs it, checks that the lock is
   * still this writer's own and renames it over the ledger. The check is a
   * **risk reduction, not a guarantee** (ADR-0026, third amendment): if the
   * user broke a lock whose owner was alive, it makes a double write less
   * likely and cannot make it impossible.
   */
  private async writeAtomically(bytes: Buffer, lock: HeldLock): Promise<void> {
    const temporary = `${this.path}.tmp-${process.pid}-${Date.now()}`;
    const handle = await this.ops.open(temporary, "w");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await this.options.beforeCommit?.();
      await lock.assertOwned();
      await this.ops.rename(temporary, this.path);
    } finally {
      await this.ops.rm(temporary);
    }
  }

  async load(): Promise<LoadedLedger> {
    const bytes = await this.readBytes();
    const lines = FileLedgerStore.linesOf(bytes);
    const events = decodeLines(lines, this.schema);
    return { events, etag: FileLedgerStore.etagOf(bytes), lines };
  }

  private async currentBytes(etag: string): Promise<Buffer> {
    const bytes = await this.readBytes();
    if (FileLedgerStore.etagOf(bytes) !== etag) {
      throw new ConflictError();
    }
    return bytes;
  }

  /** Adds `text` at the end, on `etag`. The caller holds `lock`. */
  private async addText(lock: HeldLock, text: string, etag: string): Promise<{ etag: string }> {
    const bytes = await this.currentBytes(etag);
    const separator = bytes.length > 0 && bytes[bytes.length - 1] !== NEWLINE ? "\n" : "";
    const next = Buffer.concat([bytes, Buffer.from(separator + text, "utf8")]);
    await this.writeAtomically(next, lock);
    return { etag: FileLedgerStore.etagOf(next) };
  }

  /** Replaces the ledger by `text`, archiving its bytes first. The caller holds `lock`. */
  private async putText(
    lock: HeldLock,
    text: string,
    etag: string,
    archiveName: string,
  ): Promise<{ etag: string }> {
    const bytes = await this.currentBytes(etag);
    const archiveDir = join(this.folder, "archive");
    await this.ops.mkdir(archiveDir);
    let archive: WritableFile;
    try {
      archive = await this.ops.open(join(archiveDir, archiveName), "wx");
    } catch (error) {
      if (hasCode(error, "EEXIST")) {
        throw new ArchiveExistsError(archiveName);
      }
      throw error;
    }
    try {
      await archive.writeFile(bytes);
      await archive.sync();
    } finally {
      await archive.close();
    }
    const next = Buffer.from(text, "utf8");
    await this.writeAtomically(next, lock);
    return { etag: FileLedgerStore.etagOf(next) };
  }

  private async writeFileDurably(lock: HeldLock, relativePath: string, bytes: Uint8Array) {
    const target = join(this.folder, relativePath);
    const directory = dirname(target);
    await this.ops.mkdir(directory);
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    const handle = await this.ops.open(temporary, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await lock.assertOwned();
      await this.ops.rename(temporary, target);
    } finally {
      await this.ops.rm(temporary);
    }
    await this.ops.syncDir(directory);
  }

  private writerFor(lock: HeldLock): LockedLedgerWriter {
    return {
      lock,
      load: () => this.load(),
      appendLines: async (lines, etag) =>
        this.addText(lock, rawLinesText(lines, this.schema), etag),
      replaceLines: async (lines, etag, archiveName) => {
        checkArchiveName(archiveName);
        return this.putText(lock, rawLinesText(lines, this.schema), etag, archiveName);
      },
      readFile: (relativePath) => this.readOptional(join(this.folder, relativePath)),
      writeFile: (relativePath, bytes) => this.writeFileDurably(lock, relativePath, bytes),
    };
  }

  /**
   * Takes the lock of the folder **once** and runs `write` with a writer that
   * never takes it again, releasing it always, also when `write` fails. Every
   * comparison and every write of `write` happens inside this one hold.
   */
  underLock<T>(write: (writer: LockedLedgerWriter) => Promise<T>): Promise<T> {
    return withFolderLock(this.folder, (lock) => write(this.writerFor(lock)));
  }

  async append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }> {
    return withFolderLock(this.folder, (lock) => this.addText(lock, serialise(events), etag));
  }

  async replace(
    events: readonly LedgerEvent[],
    etag: string,
    archiveName: string,
  ): Promise<{ etag: string }> {
    checkArchiveName(archiveName);
    return withFolderLock(this.folder, (lock) =>
      this.putText(lock, serialise(events), etag, archiveName),
    );
  }

  /** The bytes exactly as given (ADR-0026, Part A, amendment): the sync and the restore only. */
  async appendLines(lines: readonly string[], etag: string): Promise<{ etag: string }> {
    const text = rawLinesText(lines, this.schema);
    return withFolderLock(this.folder, (lock) => this.addText(lock, text, etag));
  }

  async replaceLines(
    lines: readonly string[],
    etag: string,
    archiveName: string,
  ): Promise<{ etag: string }> {
    checkArchiveName(archiveName);
    const text = rawLinesText(lines, this.schema);
    return withFolderLock(this.folder, (lock) => this.putText(lock, text, etag, archiveName));
  }
}
