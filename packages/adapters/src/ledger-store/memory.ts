// In-memory LedgerStore for tests and dry runs. It keeps serialised lines, so
// it enforces the same decoding contract as the file store (newer schema
// versions are rejected, numbers in amounts are rejected).

import {
  ConflictError,
  decodeLine,
  encodeLine,
  type LedgerEvent,
  type LedgerStore,
  type LoadedLedger,
} from "@atlas/domain";

export class MemoryLedgerStore implements LedgerStore {
  private readonly lines: string[];
  private version = 0;

  private constructor(lines: string[]) {
    this.lines = lines;
  }

  static empty(): MemoryLedgerStore {
    return new MemoryLedgerStore([]);
  }

  static fromEvents(events: readonly LedgerEvent[]): MemoryLedgerStore {
    return new MemoryLedgerStore(events.map(encodeLine));
  }

  /** Raw lines, exactly as a file would contain them (without trailing newlines). */
  static fromLines(lines: readonly string[]): MemoryLedgerStore {
    return new MemoryLedgerStore([...lines]);
  }

  async load(): Promise<LoadedLedger> {
    const events = this.lines.map((line) => decodeLine(line).event);
    return { events, etag: String(this.version) };
  }

  async append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }> {
    if (etag !== String(this.version)) {
      throw new ConflictError();
    }
    for (const event of events) {
      this.lines.push(encodeLine(event));
    }
    this.version += 1;
    return { etag: String(this.version) };
  }

  /** Serialised content, for assertions. */
  toText(): string {
    return this.lines.map((line) => `${line}\n`).join("");
  }
}
