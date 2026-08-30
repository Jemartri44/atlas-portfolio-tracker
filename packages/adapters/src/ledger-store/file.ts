// Local JSONL LedgerStore (data-schema.md §5): the file is read whole, every
// line is decoded (a newer schema version aborts the load), the etag is the
// SHA-256 of the bytes, and `append` copies the original bytes verbatim before
// the new lines into a temporary file that replaces the ledger atomically.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import {
  ConflictError,
  decodeLine,
  encodeLine,
  type LedgerEvent,
  type LedgerStore,
  type LoadedLedger,
  ValidationError,
} from "@atlas/domain";

const NEWLINE = 0x0a;

const isMissing = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "ENOENT";

export class FileLedgerStore implements LedgerStore {
  constructor(private readonly path: string) {}

  private async readBytes(): Promise<Buffer> {
    try {
      return await fs.readFile(this.path);
    } catch (error) {
      if (isMissing(error)) {
        return Buffer.alloc(0);
      }
      throw error;
    }
  }

  private static etagOf(bytes: Buffer): string {
    return createHash("sha256").update(bytes).digest("hex");
  }

  async load(): Promise<LoadedLedger> {
    const bytes = await this.readBytes();
    const lines = bytes.toString("utf8").split("\n");
    if (lines[lines.length - 1] === "") {
      lines.pop();
    }
    const events: LedgerEvent[] = lines.map((line, index) => {
      try {
        return decodeLine(line).event;
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
    return { events, etag: FileLedgerStore.etagOf(bytes) };
  }

  async append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }> {
    const bytes = await this.readBytes();
    if (FileLedgerStore.etagOf(bytes) !== etag) {
      throw new ConflictError();
    }
    const separator = bytes.length > 0 && bytes[bytes.length - 1] !== NEWLINE ? "\n" : "";
    const addition = separator + events.map((event) => `${encodeLine(event)}\n`).join("");
    const next = Buffer.concat([bytes, Buffer.from(addition, "utf8")]);
    const temporary = `${this.path}.tmp-${process.pid}-${Date.now()}`;
    const handle = await fs.open(temporary, "w");
    try {
      await handle.writeFile(next);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, this.path);
    return { etag: FileLedgerStore.etagOf(next) };
  }
}
