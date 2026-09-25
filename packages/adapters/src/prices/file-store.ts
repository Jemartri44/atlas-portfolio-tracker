// `prices/` next to the ledger, on the disk (ADR-0031, «Almacén»; data-schema
// §1): `<asset_id>.jsonl`, `symbols.json`, `_status.json` and the
// `config.json` the user writes.
//
// **Every write under the lock of the ledger folder** (ADR-0026, Part B,
// amended: one lock covers every write in the folder), atomic: a temporary
// file created exclusively (`"wx"`), synced, the lock checked to still be
// ours, renamed. A run cut short leaves each file as it was before or as it
// is after, never in half. Appending writes the old bytes untouched followed
// by the new lines, and renames: the bytes already there are never re-encoded.
//
// A transaction waits a moment for the lock instead of failing at once: the
// lock of a write of prices is held for milliseconds (no network inside), and
// two consoles that reserve calls at the same time must queue, not abort. The
// wait is short and bounded; after it, `LedgerLockedError` as always.

import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { AssetId } from "@atlas/domain";
import { type PriceStore, type PriceTransaction, priceFileName } from "@atlas/domain/quotes";
import { type HeldLock, LedgerLockedError, withFolderLock } from "../ledger-store/folder-lock.js";

export const PRICES_DIR = "prices";

const readOrUndefined = async (path: string): Promise<string | undefined> => {
  try {
    return await fs.readFile(path, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

export interface FilePriceStoreOptions {
  /** How many times, and how long apart, a transaction asks for the lock again. */
  readonly lockAttempts?: number;
  readonly lockWaitMs?: number;
}

export class FilePriceStore implements PriceStore {
  /** `folder` is the ledger's folder. */
  constructor(
    private readonly folder: string,
    private readonly options: FilePriceStoreOptions = {},
  ) {}

  private get dir(): string {
    return join(this.folder, PRICES_DIR);
  }

  private fileOf(assetId: AssetId): string {
    return join(this.dir, priceFileName(assetId));
  }

  config = () => readOrUndefined(join(this.dir, "config.json"));
  symbols = () => readOrUndefined(join(this.dir, "symbols.json"));
  status = () => readOrUndefined(join(this.dir, "_status.json"));
  closes = (assetId: AssetId) => readOrUndefined(this.fileOf(assetId));

  private async writeAtomically(path: string, text: string, lock: HeldLock): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
    const handle = await fs.open(temporary, "wx");
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await lock.assertOwned();
      await fs.rename(temporary, path);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  async transact<T>(work: (tx: PriceTransaction) => Promise<T>): Promise<T> {
    const attempts = this.options.lockAttempts ?? 50;
    const wait = this.options.lockWaitMs ?? 100;
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await withFolderLock(this.folder, (lock) =>
          work({
            config: this.config,
            symbols: this.symbols,
            status: this.status,
            closes: this.closes,
            appendCloses: async (assetId, lines) => {
              const path = this.fileOf(assetId);
              const before = (await readOrUndefined(path)) ?? "";
              const separator = before === "" || before.endsWith("\n") ? "" : "\n";
              await this.writeAtomically(
                path,
                `${before}${separator}${lines.map((line) => `${line}\n`).join("")}`,
                lock,
              );
            },
            rewriteCloses: (assetId, lines) =>
              this.writeAtomically(
                this.fileOf(assetId),
                lines.map((line) => `${line}\n`).join(""),
                lock,
              ),
            writeStatus: (text) => this.writeAtomically(join(this.dir, "_status.json"), text, lock),
            writeSymbols: (text) =>
              this.writeAtomically(join(this.dir, "symbols.json"), text, lock),
          }),
        );
      } catch (error) {
        if (!(error instanceof LedgerLockedError) || attempt >= attempts) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
  }
}
