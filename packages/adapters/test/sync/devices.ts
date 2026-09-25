// Devices for the tests of the sync: a console on a temporary folder, or a web
// on the double of IndexedDB; each with its store of sync state and a clock
// that moves one second per reading.

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CURRENT_LEDGER_SCHEMA, type LedgerEvent } from "@atlas/domain";
import { BlobLedgerStore } from "../../src/ledger-store/blob.js";
import { LEDGER_STORE } from "../../src/ledger-store/browser/idb.js";
import { BrowserLedgerBlob } from "../../src/ledger-store/browser/indexeddb.js";
import { BrowserSyncStore } from "../../src/ledger-store/browser/sync-store.js";
import { FileLedgerStore } from "../../src/ledger-store/file.js";
import { type FileOps, nodeFileOps } from "../../src/ledger-store/file-ops.js";
import type { SyncOptions, SyncStateStore } from "../../src/sync/client.js";
import { FolderSyncStore } from "../../src/sync/folder-store.js";
import { FakeDatabase } from "../fake-idb.js";
import { textOf } from "./builder.js";

export const clock = (start = "2027-08-30T09:00:00.000Z"): SyncOptions => {
  let millis = Date.parse(start);
  return {
    schema: CURRENT_LEDGER_SCHEMA,
    now: () => {
      millis += 1000;
      return new Date(millis);
    },
  };
};

export interface Device {
  readonly kind: "console" | "web";
  readonly sync: SyncStateStore;
  /** Appends events as the application records them (the ordinary `append`). */
  record(events: readonly LedgerEvent[]): Promise<void>;
  /** The exact text of the local ledger. */
  text(): Promise<string>;
  /** The exact text of what is held back and of what was discarded. */
  held(): Promise<string>;
  discarded(): Promise<string>;
}

export interface ConsoleDevice extends Device {
  readonly dir: string;
  readonly ledger: FileLedgerStore;
}

export const consoleDevice = async (
  events: readonly LedgerEvent[],
  opsFor: (dir: string) => FileOps = () => nodeFileOps,
): Promise<ConsoleDevice> => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-sync-014-"));
  const ops = opsFor(dir);
  const path = join(dir, "ledger.jsonl");
  await writeFile(path, textOf(events));
  const ledger = new FileLedgerStore(path, CURRENT_LEDGER_SCHEMA, { fileOps: ops });
  const optional = (name: string) => readFile(join(dir, "sync", name), "utf8").catch(() => "");
  return {
    kind: "console",
    dir,
    ledger,
    sync: new FolderSyncStore(ledger, ops),
    record: async (more) => {
      await ledger.append(more, (await ledger.load()).etag);
    },
    text: () => readFile(path, "utf8"),
    held: () => optional("held.jsonl"),
    discarded: () => optional("discarded.jsonl"),
  };
};

export interface WebDevice extends Device {
  readonly db: FakeDatabase;
  readonly open: () => Promise<IDBDatabase>;
}

export const webDevice = (events: readonly LedgerEvent[]): WebDevice => {
  const db = new FakeDatabase([LEDGER_STORE]);
  db.store(LEDGER_STORE).set("current", {
    text: textOf(events),
    updatedAt: "2027-08-01T00:00:00.000Z",
  });
  const open = () => Promise.resolve(db.asIdb());
  const ledger = new BlobLedgerStore(new BrowserLedgerBlob(open));
  const key = (name: string) => (db.store(LEDGER_STORE).get(name) as string | undefined) ?? "";
  return {
    kind: "web",
    db,
    open,
    sync: new BrowserSyncStore(open),
    record: async (more) => {
      await ledger.append(more, (await ledger.load()).etag);
    },
    text: async () => (db.store(LEDGER_STORE).get("current") as { text: string }).text,
    held: async () => key("sync:held"),
    discarded: async () => key("sync:discarded"),
  };
};
