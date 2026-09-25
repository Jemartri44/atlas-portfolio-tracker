// In-memory LedgerStore for tests and dry runs. It keeps serialised lines, so
// it enforces the same decoding contract as the file store (newer schema
// versions are rejected, numbers in amounts are rejected) and keeps the
// archives written by `replace` in a map the tests can inspect.

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
  rawLinesText,
  ValidationError,
} from "@atlas/domain";

export class MemoryLedgerStore implements LedgerStore {
  private lines: string[];
  private version = 0;
  private readonly archived = new Map<string, string>();

  private constructor(
    lines: string[],
    readonly schema: LedgerSchema,
  ) {
    this.lines = lines;
  }

  static empty(schema: LedgerSchema = CURRENT_LEDGER_SCHEMA): MemoryLedgerStore {
    return new MemoryLedgerStore([], schema);
  }

  static fromEvents(
    events: readonly LedgerEvent[],
    schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
  ): MemoryLedgerStore {
    return new MemoryLedgerStore(events.map(encodeLine), schema);
  }

  /** Raw lines, exactly as a file would contain them (without trailing newlines). */
  static fromLines(
    lines: readonly string[],
    schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
  ): MemoryLedgerStore {
    return new MemoryLedgerStore([...lines], schema);
  }

  async load(): Promise<LoadedLedger> {
    const events = this.lines.map((line) => decodeLine(line, this.schema).event);
    return { events, etag: String(this.version), lines: [...this.lines] };
  }

  private assertEtag(etag: string): void {
    if (etag !== String(this.version)) {
      throw new ConflictError();
    }
  }

  async append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }> {
    this.assertEtag(etag);
    for (const event of events) {
      this.lines.push(encodeLine(event));
    }
    this.version += 1;
    return { etag: String(this.version) };
  }

  async replace(
    events: readonly LedgerEvent[],
    etag: string,
    archiveName: string,
  ): Promise<{ etag: string }> {
    return this.put(events.map(encodeLine), etag, archiveName);
  }

  async appendLines(lines: readonly string[], etag: string): Promise<{ etag: string }> {
    rawLinesText(lines, this.schema);
    this.assertEtag(etag);
    this.lines.push(...lines);
    this.version += 1;
    return { etag: String(this.version) };
  }

  async replaceLines(
    lines: readonly string[],
    etag: string,
    archiveName: string,
  ): Promise<{ etag: string }> {
    rawLinesText(lines, this.schema);
    return this.put([...lines], etag, archiveName);
  }

  /**
   * The archive name is checked as the file and browser stores check it: a
   * name with a separator would write outside `archive/` there, and the three
   * stores pass the same contract (feature 014, V13).
   */
  private put(lines: string[], etag: string, archiveName: string): { etag: string } {
    if (archiveName.length === 0 || /[/\\]/.test(archiveName)) {
      throw new ValidationError("invalid_archive_name", "archive name must be a plain file name", {
        archive_name: archiveName,
      });
    }
    this.assertEtag(etag);
    if (this.archived.has(archiveName)) {
      throw new ArchiveExistsError(archiveName);
    }
    this.archived.set(archiveName, this.toText());
    this.lines = lines;
    this.version += 1;
    return { etag: String(this.version) };
  }

  /** Archives written by `replace`, by name, with the exact text they hold. */
  get archives(): ReadonlyMap<string, string> {
    return this.archived;
  }

  /** Serialised content, for assertions. */
  toText(): string {
    return this.lines.map((line) => `${line}\n`).join("");
  }
}
