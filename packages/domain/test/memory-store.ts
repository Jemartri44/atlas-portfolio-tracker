// Minimal in-memory LedgerStore for domain tests (the real adapters live in
// @atlas/adapters). It keeps serialised lines so it honours the same decoding
// contract as a file: schema injection, raw lines, archives on replace.

import { ArchiveExistsError, ConflictError } from "../src/errors.js";
import type { LedgerStore, LoadedLedger } from "../src/ports/ledger-store.js";
import type { LedgerEvent } from "../src/schema/events.js";
import { decodeLine, encodeLine } from "../src/schema/line.js";
import { CURRENT_LEDGER_SCHEMA, type LedgerSchema } from "../src/schema/migrations/index.js";

export class TestStore implements LedgerStore {
  private lines: string[];
  private version = 0;
  /** Archives written by `replace`, by name. */
  readonly archives = new Map<string, string>();

  constructor(
    events: readonly LedgerEvent[] = [],
    readonly schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
  ) {
    this.lines = events.map(encodeLine);
  }

  static fromLines(lines: readonly string[], schema: LedgerSchema = CURRENT_LEDGER_SCHEMA) {
    const store = new TestStore([], schema);
    store.lines = [...lines];
    return store;
  }

  async load(): Promise<LoadedLedger> {
    return {
      events: this.lines.map((line) => decodeLine(line, this.schema).event),
      etag: String(this.version),
      lines: [...this.lines],
    };
  }

  private assertEtag(etag: string): void {
    if (etag !== String(this.version)) {
      throw new ConflictError();
    }
  }

  async append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }> {
    this.assertEtag(etag);
    this.lines.push(...events.map(encodeLine));
    this.version += 1;
    return { etag: String(this.version) };
  }

  async replace(
    events: readonly LedgerEvent[],
    etag: string,
    archiveName: string,
  ): Promise<{ etag: string }> {
    this.assertEtag(etag);
    if (this.archives.has(archiveName)) {
      throw new ArchiveExistsError(archiveName);
    }
    this.archives.set(archiveName, this.text());
    this.lines = events.map(encodeLine);
    this.version += 1;
    return { etag: String(this.version) };
  }

  /** Decoded events, for assertions. */
  all(): LedgerEvent[] {
    return this.lines.map((line) => decodeLine(line, this.schema).event);
  }

  /** Serialised content, exactly as a file would hold it. */
  text(): string {
    return this.lines.map((line) => `${line}\n`).join("");
  }
}
