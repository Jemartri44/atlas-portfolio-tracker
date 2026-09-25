// The console's sync state in `sync/` of the ledger folder (ADR-0026, Part B;
// plan §5 and §6): `state.json` (the marker), `held.jsonl` and
// `discarded.jsonl` (append-only). **Every write under the lock of the
// folder, and the whole of step 6 under one hold of it** — the lock is not
// re-entrant, so it goes through `FileLedgerStore.underLock`, whose writer
// never takes it again. The file operations are injected (§6.3 (V9)): a test
// records their order and proves that what is held back is on disk before the
// ledger loses the line.

import { join } from "node:path";
import { ConflictError, type LoadedLedger } from "@atlas/domain";
import type { DeviceChange, DeviceState, SyncStateStore } from "@atlas/domain/sync";
import { parseMarker, recordsText, type SyncPresence, serializeMarker } from "@atlas/domain/sync";
import type { FileLedgerStore } from "../ledger-store/file.js";
import { type FileOps, nodeFileOps } from "../ledger-store/file-ops.js";

export const SYNC_DIR = "sync";
export const MARKER_FILE = join(SYNC_DIR, "state.json");
export const HELD_FILE = join(SYNC_DIR, "held.jsonl");
export const DISCARDED_FILE = join(SYNC_DIR, "discarded.jsonl");

const hasCode = (error: unknown, code: string): boolean =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === code;

const readText = async (ops: FileOps, path: string): Promise<string | undefined> => {
  try {
    return (await ops.readFile(path)).toString("utf8");
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return undefined;
    }
    throw error;
  }
};

/** What `sync/` of a folder says: absent, or present with its marker missing, unreadable or read. */
export const folderSyncPresence = async (
  folder: string,
  ops: FileOps = nodeFileOps,
): Promise<{ presence: SyncPresence; markerText: string | undefined }> => {
  if (!(await ops.isDirectory(join(folder, SYNC_DIR)))) {
    return { presence: { present: false }, markerText: undefined };
  }
  const markerText = await readText(ops, join(folder, MARKER_FILE));
  if (markerText === undefined) {
    return { presence: { present: true, marker: "missing" }, markerText };
  }
  try {
    return { presence: { present: true, marker: parseMarker(markerText) }, markerText };
  } catch {
    return { presence: { present: true, marker: "unreadable" }, markerText };
  }
};

export class FolderSyncStore implements SyncStateStore {
  constructor(
    private readonly ledger: FileLedgerStore,
    private readonly ops: FileOps = nodeFileOps,
  ) {}

  private get folder(): string {
    return this.ledger.folder;
  }

  async read(): Promise<DeviceState> {
    const ledger: LoadedLedger = await this.ledger.load();
    const { presence, markerText } = await folderSyncPresence(this.folder, this.ops);
    return {
      ledger,
      presence,
      markerText,
      heldText: (await readText(this.ops, join(this.folder, HELD_FILE))) ?? "",
      discardedText: (await readText(this.ops, join(this.folder, DISCARDED_FILE))) ?? "",
    };
  }

  /**
   * Step 6 and every resolution: **one** hold of the lock, in which everything
   * read at step 1 is compared and then written **destination before origin**,
   * the order deduced from the direction of each move (see the comment inside):
   * the records of `held.jsonl` that are not a release — `held`, which gains a
   * line, and `redo_started`, which seals the id a redo will carry —, then
   * `discarded.jsonl`, the ledger, the records that release a line
   * (`resolved`) and the marker. A cut between two of them leaves every line
   * in both places, never in none.
   */
  async commit(expected: DeviceState, change: DeviceChange): Promise<void> {
    await this.ledger.underLock(async (writer) => {
      const now = await writer.load();
      const text = async (path: string): Promise<string | undefined> =>
        (await writer.readFile(path))?.toString("utf8");
      if (
        now.etag !== expected.ledger.etag ||
        ((await text(HELD_FILE)) ?? "") !== expected.heldText ||
        ((await text(DISCARDED_FILE)) ?? "") !== expected.discardedText ||
        (await text(MARKER_FILE)) !== expected.markerText
      ) {
        throw new ConflictError();
      }
      // **The destination before the origin** (review of PR #83, B1): a line
      // that moves is written where it goes before the place it leaves forgets
      // it, so a cut between the two leaves it in both, never in none. The
      // order follows the direction of each move, not a fixed list:
      //   - held back: `held.jsonl` gains it, then the ledger loses it;
      //   - confirmed: the ledger gains it, then `held.jsonl` marks it resolved;
      //   - discarded or redone: `discarded.jsonl` gains it, then it is resolved.
      const held = change.held ?? [];
      const gained = held.filter((record) => record.kind !== "resolved");
      const released = held.filter((record) => record.kind === "resolved");
      if (gained.length > 0) {
        await writer.writeFile(HELD_FILE, Buffer.from(expected.heldText + recordsText(gained)));
      }
      if (change.discarded !== undefined && change.discarded.length > 0) {
        await writer.writeFile(
          DISCARDED_FILE,
          Buffer.from(expected.discardedText + recordsText(change.discarded)),
        );
      }
      if (change.ledger !== undefined) {
        if ("append" in change.ledger) {
          await writer.appendLines(change.ledger.append, now.etag);
        } else {
          await writer.replaceLines(change.ledger.replace, now.etag, change.ledger.archive);
        }
      }
      if (released.length > 0) {
        await writer.writeFile(
          HELD_FILE,
          Buffer.from(expected.heldText + recordsText(gained) + recordsText(released)),
        );
      }
      if (change.marker !== undefined) {
        await writer.writeFile(MARKER_FILE, Buffer.from(serializeMarker(change.marker)));
      }
    });
  }
}
