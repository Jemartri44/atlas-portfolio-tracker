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

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
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
  ValidationError,
} from "@atlas/domain";
import { type HeldLock, withFolderLock } from "./folder-lock.js";

const NEWLINE = 0x0a;

const hasCode = (error: unknown, code: string): boolean =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === code;

const serialise = (events: readonly LedgerEvent[]): string =>
  events.map((event) => `${encodeLine(event)}\n`).join("");

export interface FileLedgerStoreOptions {
  /**
   * **Test seam only**: runs with the lock held, after the temporary file is
   * written and right before the ownership check and the rename. It is how the
   * tests break the lock, or fail a write half way, at the one moment that
   * matters.
   */
  beforeCommit?: () => Promise<void>;
}

export class FileLedgerStore implements LedgerStore {
  constructor(
    private readonly path: string,
    readonly schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
    private readonly options: FileLedgerStoreOptions = {},
  ) {}

  /** The folder of the ledger: where the lock, `archive/` and the rest live. */
  get folder(): string {
    return dirname(this.path);
  }

  private async readBytes(): Promise<Buffer> {
    try {
      return await fs.readFile(this.path);
    } catch (error) {
      if (hasCode(error, "ENOENT")) {
        return Buffer.alloc(0);
      }
      throw error;
    }
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
    const handle = await fs.open(temporary, "w");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await this.options.beforeCommit?.();
      await lock.assertOwned();
      await fs.rename(temporary, this.path);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  async load(): Promise<LoadedLedger> {
    const bytes = await this.readBytes();
    const lines = FileLedgerStore.linesOf(bytes);
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
    return { events, etag: FileLedgerStore.etagOf(bytes), lines };
  }

  private async currentBytes(etag: string): Promise<Buffer> {
    const bytes = await this.readBytes();
    if (FileLedgerStore.etagOf(bytes) !== etag) {
      throw new ConflictError();
    }
    return bytes;
  }

  async append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }> {
    return withFolderLock(this.folder, async (lock) => {
      const bytes = await this.currentBytes(etag);
      const separator = bytes.length > 0 && bytes[bytes.length - 1] !== NEWLINE ? "\n" : "";
      const next = Buffer.concat([bytes, Buffer.from(separator + serialise(events), "utf8")]);
      await this.writeAtomically(next, lock);
      return { etag: FileLedgerStore.etagOf(next) };
    });
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
    return withFolderLock(this.folder, async (lock) => {
      const bytes = await this.currentBytes(etag);
      const archiveDir = join(this.folder, "archive");
      await fs.mkdir(archiveDir, { recursive: true });
      let archive: fs.FileHandle;
      try {
        archive = await fs.open(join(archiveDir, archiveName), "wx");
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
      const next = Buffer.from(serialise(events), "utf8");
      await this.writeAtomically(next, lock);
      return { etag: FileLedgerStore.etagOf(next) };
    });
  }
}
