// Minimal in-memory LedgerStore for domain tests (the real adapters live in @atlas/adapters).

import { ConflictError } from "../src/errors.js";
import type { LedgerStore, LoadedLedger } from "../src/ports/ledger-store.js";
import type { LedgerEvent } from "../src/schema/events.js";

export class TestStore implements LedgerStore {
  private version = 0;

  constructor(private readonly events: LedgerEvent[] = []) {}

  async load(): Promise<LoadedLedger> {
    return { events: [...this.events], etag: String(this.version) };
  }

  async append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }> {
    if (etag !== String(this.version)) {
      throw new ConflictError();
    }
    this.events.push(...events);
    this.version += 1;
    return { etag: String(this.version) };
  }

  all(): LedgerEvent[] {
    return [...this.events];
  }
}
